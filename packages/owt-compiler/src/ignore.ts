/**
 * `<!-- owt-ignore a11y-missing-alt, a11y-autofocus -->` silences these
 * warnings for the node right after the comment, content included.
 * Codes are separated by spaces or commas; consecutive comments add up.
 */
import { childBodies, isTemplateNode, type ComponentItem, type Program, type Span, type TemplateNode } from '@owt/ast';
import { splitTokens } from './html';

export type IgnoreRange = Span & { codes: readonly string[] };

/** Warning codes listed by an `owt-ignore` comment, null for any other comment. */
export function ignoredCodes(comment: string): string[] | null {
  const words = splitTokens(comment, ',');
  return words[0] === 'owt-ignore' ? words.slice(1) : null;
}

/** Source ranges in which `owt-ignore` comments silence warnings. */
export function ignoreRanges(program: Program): IgnoreRange[] {
  const ranges: IgnoreRange[] = [];
  const visit = (nodes: readonly (ComponentItem | TemplateNode)[]) => {
    let codes: string[] = [];
    for (const node of nodes) {
      if (node.type === 'Comment') {
        codes.push(...(ignoredCodes(node.value) ?? []));
        continue;
      }
      if (node.type === 'Text' && node.raw.trim() === '') continue;
      if (codes.length > 0) ranges.push({ start: node.start, end: node.end, codes });
      codes = [];
      if (isTemplateNode(node)) for (const body of childBodies(node)) visit(body);
    }
  };
  for (const node of program.body) if (node.type === 'Component') visit(node.body);
  return ranges;
}
