/** Volar virtual code for `.owt` files: the TypeScript projection plus one CSS document per `<style>`. */
import type { Program } from '@owt/ast';
import { parse } from '@owt/parser';
import type { CodeInformation, CodeMapping, IScriptSnapshot, VirtualCode } from '@volar/language-core';
import { generate } from './codegen';

const ALL: CodeInformation = { verification: true, completion: true, semantic: true, navigation: true, structure: true, format: true };

function snapshot(text: string): IScriptSnapshot {
  return {
    getText: (start, end) => text.slice(start, end),
    getLength: () => text.length,
    getChangeRange: () => undefined,
  };
}

export class OwtVirtualCode implements VirtualCode {
  readonly id = 'root';
  readonly languageId = 'owt';
  mappings: CodeMapping[] = [];
  embeddedCodes: VirtualCode[] = [];
  ast!: Program;
  /** the generated TypeScript (also in `embeddedCodes`) */
  typescript!: VirtualCode;

  constructor(public snapshot: IScriptSnapshot) {
    this.update(snapshot);
  }

  update(next: IScriptSnapshot): void {
    this.snapshot = next;
    const source = next.getText(0, next.getLength());
    this.ast = parse(source);
    this.mappings = [
      {
        sourceOffsets: [0],
        generatedOffsets: [0],
        lengths: [source.length],
        data: { verification: true, completion: true, semantic: true, navigation: true, structure: true, format: true },
      },
    ];
    const ts = generate(this.ast);
    this.typescript = { id: 'ts', languageId: 'typescript', snapshot: snapshot(ts.code), mappings: ts.mappings, embeddedCodes: [] };
    const styles: VirtualCode[] = [];
    const blocks = this.ast.body.flatMap((n) => (n.type === 'Component' ? n.styles : n.type === 'StyleBlock' ? [n] : []));
    blocks.forEach((style, i) => {
      const lang = style.lang ?? 'css';
      styles.push({
        id: `style_${i}`,
        languageId: lang === 'scss' || lang === 'less' ? lang : 'css',
        snapshot: snapshot(style.content),
        mappings: [{ sourceOffsets: [style.contentSpan.start], generatedOffsets: [0], lengths: [style.content.length], data: ALL }],
        embeddedCodes: [],
      });
    });
    this.embeddedCodes = [this.typescript, ...styles];
  }
}
