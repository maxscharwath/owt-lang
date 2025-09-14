/**
 * Typed AST nodes for OWT syntax.
 * Focus: small, composable types for parser and transforms.
 */

export type Position = {
  offset: number; // 0-based absolute offset
  line: number;   // 1-based
  column: number; // 1-based
};

export type Location = {
  start: Position;
  end: Position;
};

export type BaseNode = {
  type: string;
  loc: Location;
};

export type Identifier = BaseNode & {
  type: 'Identifier';
  name: string;
};

export type Program = BaseNode & {
  type: 'Program';
  body: (Component | StyleBlock)[];
};

export type Component = BaseNode & {
  type: 'Component';
  name: string;
  export: boolean;
  propsType?: string; // serialized TS type for props, preserved through codegen
  body: Node[];
  style?: StyleBlock | null;
};

export type StyleBlock = BaseNode & {
  type: 'StyleBlock';
  content: string;
};

export type Text = BaseNode & {
  type: 'Text';
  value: string;
};

export type Expr = BaseNode & {
  type: 'Expr';
  code: string; // raw TS expression
};

export type Attribute = BaseNode & {
  type: 'Attribute';
  name: string;
  value: Text | Expr | null;
};

export type ShorthandAttribute = BaseNode & {
  type: 'ShorthandAttribute'; // Example usage: {onClick}
  name: string;
};

export type SpreadAttribute = BaseNode & {
  type: 'SpreadAttribute'; // {...props}
  argument: Expr;
};

export type Element = BaseNode & {
  type: 'Element';
  name: string; // tag or component name
  selfClosing: boolean;
  attributes: (Attribute | ShorthandAttribute | SpreadAttribute)[];
  children: Node[];
};

export type VarDecl = BaseNode & {
  type: 'VarDecl';
  name: string;
  tsType?: string;
  init: Expr | null;
};

export type ValDecl = BaseNode & {
  type: 'ValDecl';
  name: string;
  tsType?: string;
  init: Expr; // required
};

export type FunctionDecl = BaseNode & {
  type: 'FunctionDecl';
  name: string;
  params: string; // serialized TS parameter list
  returnType?: string; // serialized TS return type
  body: Expr; // function body as expression
};

export type IfBranch = BaseNode & {
  type: 'IfBranch';
  test: Expr;
  consequent: Node[];
};

export type ElseBranch = BaseNode & {
  type: 'ElseBranch';
  consequent: Node[];
};

export type IfBlock = BaseNode & {
  type: 'IfBlock';
  branches: IfBranch[];
  alternate?: ElseBranch | null;
};

export type ForBlock = BaseNode & {
  type: 'ForBlock';
  item: string; // simple identifier for now
  iterable: Expr; // of expression
  metaIdent?: string | null; // meta ident name
  metaDestructuring?: string[]; // destructured properties from meta object
  body: Node[];
  empty?: Node[] | null;
};

export type SlotPlaceholder = BaseNode & {
  type: 'SlotPlaceholder';
  name?: string | null; // default when null
};

export type SlotContent = BaseNode & {
  type: 'SlotContent';
  name?: string | null; // default when null
  body: Node[];
};

export type SwitchBlock = BaseNode & {
  type: 'SwitchBlock';
  discriminant: Expr;
  cases: CaseBlock[];
  defaultCase?: Node[] | null;
};

export type CaseBlock = BaseNode & {
  type: 'CaseBlock';
  pattern: string; // serialized pattern; initial support: literals only
  guard?: Expr | null;
  body: Node[];
};

export type Node =
  | Text
  | Expr
  | Element
  | VarDecl
  | ValDecl
  | FunctionDecl
  | IfBlock
  | ForBlock
  | SlotPlaceholder
  | SlotContent
  | SwitchBlock
  | CaseBlock
  | StyleBlock;

export type AnyNode = Node | Component | Program;

