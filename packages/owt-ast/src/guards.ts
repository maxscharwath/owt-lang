import type {
  AnyNode,
  Attribute,
  CaseBlock,
  Component,
  Element,
  Expr,
  ForBlock,
  FunctionDecl,
  IfBlock,
  Node,
  Program,
  ShorthandAttribute,
  SlotContent,
  SlotPlaceholder,
  SpreadAttribute,
  StyleBlock,
  SwitchBlock,
  Text,
  ValDecl,
  VarDecl,
} from './index';

// Program-level
export const isProgram = (n: AnyNode): n is Program => n.type === 'Program';
export const isComponent = (n: Component | StyleBlock): n is Component => n.type === 'Component';
export const isStyleBlock = (n: Component | StyleBlock | Node): n is StyleBlock => n.type === 'StyleBlock';

// Node-level
export const isText = (n: Node): n is Text => n.type === 'Text';
export const isExpr = (n: Node): n is Expr => n.type === 'Expr';
export const isElement = (n: Node): n is Element => n.type === 'Element';
export const isVarDecl = (n: Node): n is VarDecl => n.type === 'VarDecl';
export const isValDecl = (n: Node): n is ValDecl => n.type === 'ValDecl';
export const isFunctionDecl = (n: Node): n is FunctionDecl => n.type === 'FunctionDecl';
export const isIfBlock = (n: Node): n is IfBlock => n.type === 'IfBlock';
export const isForBlock = (n: Node): n is ForBlock => n.type === 'ForBlock';
export const isSlotPlaceholder = (n: Node): n is SlotPlaceholder => n.type === 'SlotPlaceholder';
export const isSlotContent = (n: Node): n is SlotContent => n.type === 'SlotContent';
export const isSwitchBlock = (n: Node): n is SwitchBlock => n.type === 'SwitchBlock';
export const isCaseBlock = (n: Node): n is CaseBlock => n.type === 'CaseBlock';

// Attributes
export type AnyAttribute = Attribute | ShorthandAttribute | SpreadAttribute;
export const isAttribute = (a: AnyAttribute): a is Attribute => a.type === 'Attribute';
export const isShorthandAttribute = (a: AnyAttribute): a is ShorthandAttribute => a.type === 'ShorthandAttribute';
export const isSpreadAttribute = (a: AnyAttribute): a is SpreadAttribute => a.type === 'SpreadAttribute';

