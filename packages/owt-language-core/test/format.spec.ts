import { describe, expect, it } from 'vitest';
import { format } from '../src/format';

function apply(source: string): string {
  const edits = format(source, { tabSize: 2, insertSpaces: true });
  let out = source;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

describe('format', () => {
  it('indents markup by structure', () => {
    const src = 'export component A() {\n<div>\n<p>hi</p>\n</div>\n}\n';

    expect(apply(src)).toBe('export component A() {\n  <div>\n    <p>hi</p>\n  </div>\n}\n');
  });

  it('indents block bodies and keeps else on the closing line', () => {
    const src = 'component A() {\nif (x) {\n<a/>\n} else {\n<b/>\n}\n}';

    expect(apply(src)).toBe('component A() {\n  if (x) {\n    <a/>\n  } else {\n    <b/>\n  }\n}');
  });

  it('keeps relative indentation inside statements', () => {
    const src = 'component A() {\n    function f() {\n      return 1\n    }\n}';

    expect(apply(src)).toBe('component A() {\n  function f() {\n    return 1\n  }\n}');
  });

  it('indents attributes on their own lines', () => {
    const src = 'component A() {\n<input\ntype="text"\n/>\n}';

    expect(apply(src)).toBe('component A() {\n  <input\n    type="text"\n  />\n}');
  });

  it('leaves module code untouched and trims trailing spaces', () => {
    const src = 'const x = {\n      a: 1,   \n}\n';

    expect(apply(src)).toBe('const x = {\n      a: 1,\n}\n');
  });

  it('does nothing when the file has syntax errors', () => {
    expect(format('component A() { <div> }', { tabSize: 2, insertSpaces: true })).toEqual([]);
  });
});
