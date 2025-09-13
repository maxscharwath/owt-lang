// Minimal source map builder for line-level mappings
// Generates a VLQ-encoded mappings string with only source/index 0

const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toVLQSigned(value: number): number {
  return value < 0 ? ((-value) << 1) + 1 : (value << 1) + 0;
}

function encodeVLQ(value: number): string {
  let v = toVLQSigned(value);
  let out = '';
  do {
    let digit = v & 31; // 5 bits
    v >>>= 5;
    if (v > 0) digit |= 32; // continuation
    out += base64Chars[digit] ?? '';
  } while (v > 0);
  return out;
}

export class SourceMapBuilder {
  private mappings: string[] = [];
  private currentLine = 0; // 0-based generated line
  private lastGeneratedColumn = 0;
  private lastSource = 0;
  private lastOriginalLine = 0;
  private lastOriginalColumn = 0;
  private readonly lastName = 0;

  constructor(private readonly filename: string, private readonly sourceContent: string) {}

  // Ensure mappings has lines up to genLine
  private ensureLine(genLine: number) {
    while (this.currentLine < genLine) {
      this.mappings.push('');
      this.currentLine++;
      this.lastGeneratedColumn = 0;
    }
  }

  addMapping(genLine: number, genColumn: number, origLine: number, origColumn: number) {
    this.ensureLine(genLine);
    const seg: string[] = [];
    // generated column delta
    seg.push(encodeVLQ(genColumn - this.lastGeneratedColumn));
    this.lastGeneratedColumn = genColumn;
    // source index (always 0)
    seg.push(encodeVLQ(0 - this.lastSource));
    this.lastSource = 0;
    // original line
    seg.push(encodeVLQ(origLine - this.lastOriginalLine));
    this.lastOriginalLine = origLine;
    // original column
    seg.push(encodeVLQ(origColumn - this.lastOriginalColumn));
    this.lastOriginalColumn = origColumn;
    // no name
    const segment = seg.join('');
    const curr = this.mappings[this.currentLine] ?? '';
    this.mappings[this.currentLine] = curr ? curr + ',' + segment : segment;
  }

  toJSON(): any {
    return {
      version: 3,
      file: this.filename,
      sources: [this.filename],
      sourcesContent: [this.sourceContent],
      names: [],
      mappings: this.mappings.join(';'),
    };
  }
}

