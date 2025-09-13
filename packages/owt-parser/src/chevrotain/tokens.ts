// Experimental Chevrotain lexer tokens for OWT
// This is a minimal token set to mirror the current tokenizer.
import { createToken, Lexer } from 'chevrotain';

export const WhiteSpace = createToken({ name: 'WhiteSpace', pattern: /[ \t\r\n]+/, group: Lexer.SKIPPED });
// Capture comments for potential source maps, but keep them out of the main token stream
export const LineComment = createToken({ name: 'LineComment', pattern: /\/\/[^\n]*/, group: 'comments' });
export const BlockComment = createToken({ name: 'BlockComment', pattern: /\/\*[\s\S]*?\*\//, group: 'comments' });
export const Lt = createToken({ name: 'Lt', pattern: /</ });
export const Gt = createToken({ name: 'Gt', pattern: />/ });
export const Slash = createToken({ name: 'Slash', pattern: /\// });
export const Equals = createToken({ name: 'Equals', pattern: /=/ });
export const Colon = createToken({ name: 'Colon', pattern: /:/ });
export const Semicolon = createToken({ name: 'Semicolon', pattern: /;/ });
export const LBrace = createToken({ name: 'LBrace', pattern: /\{/ });
export const RBrace = createToken({ name: 'RBrace', pattern: /\}/ });
export const LParen = createToken({ name: 'LParen', pattern: /\(/ });
export const RParen = createToken({ name: 'RParen', pattern: /\)/ });
export const LBracket = createToken({ name: 'LBracket', pattern: /\[/ });
export const RBracket = createToken({ name: 'RBracket', pattern: /\]/ });
export const Comma = createToken({ name: 'Comma', pattern: /,/ });
export const Dot = createToken({ name: 'Dot', pattern: /\./ });
// Additional operators/punctuators commonly used in expressions
export const Plus = createToken({ name: 'Plus', pattern: /\+/ });
export const Minus = createToken({ name: 'Minus', pattern: /-/ });
export const Star = createToken({ name: 'Star', pattern: /\*/ });
export const Percent = createToken({ name: 'Percent', pattern: /%/ });
export const Bang = createToken({ name: 'Bang', pattern: /!/ });
export const Amp = createToken({ name: 'Amp', pattern: /&/ });
export const PipeTok = createToken({ name: 'PipeTok', pattern: /\|/ });
export const Question = createToken({ name: 'Question', pattern: /\?/ });
export const Backtick = createToken({ name: 'Backtick', pattern: /`/ });

export const StringLiteral = createToken({
  name: 'StringLiteral',
  // simplified: '...' or "..." without newlines
  pattern: /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/
});

export const ExportKw = createToken({ name: 'ExportKw', pattern: /export/ });
export const ComponentKw = createToken({ name: 'ComponentKw', pattern: /component/ });
export const VarKw = createToken({ name: 'VarKw', pattern: /var/ });
export const ValKw = createToken({ name: 'ValKw', pattern: /val/ });
export const IfKw = createToken({ name: 'IfKw', pattern: /if/ });
export const ElseKw = createToken({ name: 'ElseKw', pattern: /else/ });
export const ForKw = createToken({ name: 'ForKw', pattern: /for/ });
export const EmptyKw = createToken({ name: 'EmptyKw', pattern: /empty/ });
export const SwitchKw = createToken({ name: 'SwitchKw', pattern: /switch/ });
export const CaseKw = createToken({ name: 'CaseKw', pattern: /case/ });
export const DefaultKw = createToken({ name: 'DefaultKw', pattern: /default/ });
export const SlotKw = createToken({ name: 'SlotKw', pattern: /slot/ });

export const Identifier = createToken({ name: 'Identifier', pattern: /[A-Za-z_][\w\-]*/ });

// Also recognize numeric literals to avoid lexer errors in expressions
export const NumberLiteral = createToken({ name: 'NumberLiteral', pattern: /\d+(?:_\d+)*(?:\.\d+(?:_\d+)*)?/ });

export const AllTokens = [
  WhiteSpace,
  // Order matters: recognize comments before '/'
  LineComment, BlockComment,
  Lt, Gt, Slash, Equals, Colon, Semicolon,
  LBrace, RBrace, LParen, RParen, LBracket, RBracket,
  Comma, Dot, Plus, Minus, Star, Percent, Bang, Amp, PipeTok, Question, Backtick,
  StringLiteral, NumberLiteral,
  ExportKw, ComponentKw, VarKw, ValKw, IfKw, ElseKw, ForKw, EmptyKw, SwitchKw, CaseKw, DefaultKw, SlotKw,
  Identifier
];

export const OwtLexer = new Lexer(AllTokens, { ensureOptimizations: true });
