import type { Attribute, Element, Node, SlotPlaceholder, SpreadAttribute, ShorthandAttribute, StyleBlock, Text } from '@owt/ast';
import type { IToken } from 'chevrotain';
import { Reader } from './reader.js';
import { locFrom, locFromWithComments } from './loc.js';
import { readBracesExpr } from './expr.js';
import { readTextRun as readTextTuple } from './text.js';
import { parseAttribute as parseAttr } from './attrs.js';

type Tok = IToken;

function parseElementHeader(r: Reader): { name: string; attributes: (Attribute | ShorthandAttribute | SpreadAttribute)[]; selfClosing: boolean; lt: any; gt: any } {
  const lt = r.next(); // '<'
  let closing = false;
  if (r.match('Slash')) { r.next(); closing = true; }
  const nameTok = r.next();
  const nameTokName = nameTok.tokenType?.name ?? '';
  if (!(nameTokName === 'Identifier' || nameTokName === 'SlotKw')) throw new Error('Expected tag name');
  if (closing) throw new Error(`Unexpected closing tag </${nameTok.image}>`);

  const name = nameTok.image;
  const attributes: (Attribute | ShorthandAttribute | SpreadAttribute)[] = [];
  let selfClosing = false;
  while (!r.eof() && !r.match('Gt') && !r.match('Slash')) {
    const t = r.peek();
    const nm = t.tokenType?.name;
    if (nm === 'Identifier' || nm === 'LBrace') {
      attributes.push(parseAttr(r));
    } else {
      r.next(); // skip incidental
    }
  }
  if (r.match('Slash')) { r.next(); selfClosing = true; }
  const gt = r.next(); // '>'
  
  return { name, attributes, selfClosing, lt, gt };
}

function parseSlotPlaceholder(name: string, attributes: (Attribute | ShorthandAttribute | SpreadAttribute)[], loc: any): SlotPlaceholder {
  let slotName: string | null = null;
  for (const a of attributes) {
    if ((a as any).type === 'Attribute' && (a as any).name === 'name' && (a as any).value && (a as any).value.type === 'Text') {
      slotName = (a as any).value.value;
    }
  }
  return { type: 'SlotPlaceholder', name: slotName, loc } as any;
}

function parseStyleElement(r: Reader, lt: any): SlotPlaceholder {
  let content = '';
  let endTok: Tok = r.prev() as any;
  while (!r.eof()) {
    if (r.match('Lt') && (r.peek(1).tokenType?.name ?? '') === 'Slash' && (r.peek(2).image ?? '').toLowerCase() === 'style') {
      r.next(); r.next(); r.next(); // < / style
      endTok = r.next(); // '>'
      break;
    }
    const t2 = r.next();
    content += t2.image ?? '';
    endTok = t2 as any;
  }
  const style: StyleBlock = { type: 'StyleBlock', content, loc: locFromWithComments(lt as any, endTok as any, (r as any).comments) } as any;
  return { type: 'SlotPlaceholder', name: '__style__', loc: style.loc } as any;
}

function parseElementChildren(r: Reader, element: Element, parseStatementOrNode: (r: Reader) => Node | null): void {
  while (!r.eof()) {
    const peekTok = r.peek();
    const nm = peekTok.tokenType?.name ?? '';
    if (nm === 'Lt') {
      if ((r.peek(1).tokenType?.name ?? '') === 'Slash') {
        // closing tag
        r.next(); r.next();
        const closeName = r.next();
        if ((closeName.image ?? '').toLowerCase() !== element.name.toLowerCase()) throw new Error(`Mismatched closing tag: expected </${element.name}> but got </${closeName.image}>`);
        r.next(); // '>'
        break;
      } else {
        element.children.push(parseElement(r, parseStatementOrNode));
        continue;
      }
    }
    if (nm === 'LBrace') {
      element.children.push(readBracesExpr(r));
      continue;
    }
    if (nm === 'IfKw' || nm === 'ForKw') {
      const node = parseStatementOrNode(r);
      if (node) element.children.push(node);
      continue;
    }
    const textRun = readTextTuple(r);
    if (textRun) element.children.push({ type: 'Text', value: textRun.value, loc: locFrom(textRun.start as any, textRun.end as any) } as Text);
  }
}

export function parseElement(r: Reader, parseStatementOrNode: (r: Reader) => Node | null): Element | SlotPlaceholder {
  const { name, attributes, selfClosing, lt, gt } = parseElementHeader(r);
  
  const element: Element = { type: 'Element', name, attributes, children: [], selfClosing, loc: locFromWithComments(lt as any, gt as any, (r as any).comments) } as Element;
  
  // slot placeholder special-case
  if (name.toLowerCase() === 'slot') {
    return parseSlotPlaceholder(name, attributes, element.loc);
  }
  if (selfClosing) return element;

  // Handle <style> specially: collect raw content until </style>
  if (name.toLowerCase() === 'style') {
    return parseStyleElement(r, lt);
  }

  // children
  parseElementChildren(r, element, parseStatementOrNode);
  return element;
}
