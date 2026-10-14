/**
 * Indentation formatter for `.owt` files.
 *
 * Markup structure (component bodies, elements, block bodies, `<style>`)
 * decides the indentation of each line. Multi-line TypeScript (statements,
 * long expressions, module code) keeps its internal relative indentation and
 * is shifted as a whole. Trailing whitespace is removed.
 */
import type { Body, ComponentDecl, Program, Span, TemplateNode } from '@owt/ast';
import { parse } from '@owt/parser';

export type FormatOptions = { tabSize: number; insertSpaces: boolean };
export type FormatEdit = { start: number; end: number; text: string };

type Zone = Span & { shift: 'relative' | 'fixed' };

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function indentOf(source: string, start: number): number {
  let i = start;
  while (source[i] === ' ' || source[i] === '\t') i++;
  return i - start;
}

class Collector {
  /** regions whose lines get one more level of indentation */
  readonly containers: Span[] = [];
  /** regions keeping their own relative indentation */
  readonly zones: Zone[] = [];

  body(body: Body): void {
    this.containers.push({ start: body.start + 1, end: body.end - 1 });
    this.nodes(body.children);
  }

  nodes(nodes: readonly TemplateNode[]): void {
    for (const node of nodes) this.node(node);
  }

  node(node: TemplateNode): void {
    switch (node.type) {
      case 'Element': {
        // attributes on their own lines
        this.containers.push({ start: node.nameSpan.end, end: node.openEnd - (node.selfClosing ? 2 : 1) });
        for (const a of node.attributes) {
          const value = a.type === 'Attribute' ? a.value : null;
          if (value !== null && value.type === 'Expression') this.zones.push({ start: value.span.start, end: value.span.end, shift: 'relative' });
          if (a.type === 'SpreadAttribute') this.zones.push({ start: a.start + 1, end: a.end - 1, shift: 'relative' });
        }
        if (node.closeNameSpan !== null) {
          const closeStart = node.closeNameSpan.start - 2;
          if (node.name === 'pre' || node.name === 'textarea' || node.name === 'script') {
            this.zones.push({ start: node.openEnd, end: closeStart, shift: 'fixed' });
          } else {
            this.containers.push({ start: node.openEnd, end: closeStart });
            this.nodes(node.children);
          }
        }
        return;
      }
      case 'ExpressionTag':
        this.zones.push({ start: node.start + 1, end: node.end - 1, shift: 'relative' });
        return;
      case 'ValDecl':
        this.zones.push({ start: node.start, end: node.end, shift: 'relative' });
        return;
      case 'IfBlock':
        for (const b of node.branches) this.body(b.body);
        if (node.alternate) this.body(node.alternate);
        return;
      case 'ForBlock':
        this.body(node.body);
        if (node.empty) this.body(node.empty);
        return;
      case 'SwitchBlock': {
        const open = node.discriminantSpan.end + 1;
        this.containers.push({ start: open, end: node.end - 1 });
        for (const c of node.cases) this.body(c.body);
        if (node.fallback) this.body(node.fallback);
        return;
      }
      case 'MatchBlock': {
        const open = node.subjectSpan.end + 1;
        this.containers.push({ start: open, end: node.end - 1 });
        for (const c of node.cases) {
          this.zones.push({ start: c.patternsSpan.start, end: c.patternsSpan.end, shift: 'relative' });
          this.body(c.body);
        }
        if (node.fallback) this.body(node.fallback);
        return;
      }
      case 'AwaitBlock':
        if (node.pending) this.body(node.pending);
        if (node.then) this.body(node.then.body);
        if (node.catch) this.body(node.catch.body);
        return;
      case 'TryBlock':
        this.body(node.body);
        if (node.catch) this.body(node.catch.body);
        return;
      case 'KeyBlock':
      case 'SlotDefinition':
        this.body(node.body);
        return;
      default:
        return;
    }
  }

  component(c: ComponentDecl): void {
    this.containers.push(c.bodySpan);
    this.zones.push({ start: c.paramsSpan.start, end: c.paramsSpan.end, shift: 'relative' });
    for (const item of c.body) {
      if (item.type === 'Statement' || item.type === 'VarDecl') this.zones.push({ start: item.start, end: item.end, shift: 'relative' });
      else this.node(item);
    }
    for (const style of c.styles) {
      this.containers.push({ start: style.contentSpan.start, end: style.contentSpan.end });
      this.zones.push({ start: style.contentSpan.start, end: style.contentSpan.end, shift: 'relative' });
    }
  }
}

export function format(source: string, options: FormatOptions, program: Program = parse(source)): FormatEdit[] {
  if (program.diagnostics.some((d) => d.severity === 'error')) return [];
  const unit = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
  const collector = new Collector();
  for (const node of program.body) {
    if (node.type === 'Component') collector.component(node);
    else collector.zones.push({ start: node.start, end: node.end, shift: 'fixed' });
  }
  const starts = lineStarts(source);
  const edits: FormatEdit[] = [];
  /** indentation delta applied to the first line of each zone */
  const zoneShift = new Map<Zone, number>();
  const width = (indent: string) => {
    let w = 0;
    for (const ch of indent) w += ch === '\t' ? options.tabSize : 1;
    return w;
  };

  for (let line = 0; line < starts.length; line++) {
    const start = starts[line]!;
    const end = line + 1 < starts.length ? starts[line + 1]! - 1 : source.length;
    const indentLen = indentOf(source, start);
    const first = start + indentLen;
    let lineEnd = end;
    if (source[lineEnd - 1] === '\r') lineEnd--;
    let contentEnd = lineEnd;
    while (contentEnd > first && (source[contentEnd - 1] === ' ' || source[contentEnd - 1] === '\t')) contentEnd--;
    if (contentEnd < lineEnd) edits.push({ start: contentEnd, end: lineEnd, text: '' });
    if (first >= contentEnd) {
      if (indentLen > 0) edits.push({ start, end: first, text: '' });
      continue;
    }
    const oldIndent = source.slice(start, first);
    const zone = collector.zones.find((z) => z.start < first && first < z.end && z.start < start);
    let next: string;
    if (zone !== undefined) {
      if (zone.shift === 'fixed') continue;
      const delta = zoneShift.get(zone) ?? 0;
      const target = Math.max(0, width(oldIndent) + delta);
      next = options.insertSpaces ? ' '.repeat(target) : '\t'.repeat(Math.floor(target / options.tabSize)) + ' '.repeat(target % options.tabSize);
    } else {
      const depth = collector.containers.filter((c) => c.start < first && first < c.end).length;
      next = unit.repeat(depth);
      for (const z of collector.zones) {
        if (z.start >= first && z.start <= contentEnd && !zoneShift.has(z)) zoneShift.set(z, width(next) - width(oldIndent));
      }
    }
    if (next !== oldIndent) edits.push({ start, end: first, text: next });
  }
  return edits;
}
