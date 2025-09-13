// Chevrotain-based parser for OWT that directly builds the AST.
import type { Program, Node, Text } from '@owt/ast';
import type { IToken } from 'chevrotain';
import { OwtLexer } from './tokens.js';
import { Reader } from './reader.js';
import { locFrom } from './loc.js';
import { readBracesExpr } from './expr.js';
import { parseIfBlock as parseIfBlk, parseForBlock as parseForBlk, parseVarVal, parseFunctionDecl } from './statements.js';
import { readTextRun as readTextTuple } from './text.js';
import { parseElement as parseEl } from './elements.js';
import { parseProgram } from './program.js';
import type { ParseOptions } from '../types.js';

type Tok = IToken;

// pos/locFrom moved to loc.ts

// moved to expr.ts

// readTextRun moved to text.ts (returns tuple); convert to AST here when used


// moved to statements.ts

function parseStatementOrNode(r: Reader): Node | null {
  const t = r.peek();
  const nm = t.tokenType?.name ?? '';
  if (nm === 'VarKw' || nm === 'ValKw') return parseVarVal(r);
  if (nm === 'FunctionKw') return parseFunctionDecl(r);
  if (nm === 'Lt') return parseEl(r, parseStatementOrNode);
  if (nm === 'LBrace') return readBracesExpr(r);
  if (nm === 'IfKw') return parseIfBlk(r, parseStatementOrNode);
  if (nm === 'ForKw') return parseForBlk(r, parseStatementOrNode);
  // text node fallback
  const tt = readTextTuple(r);
  if (!tt) return null;
  return { type: 'Text', value: tt.value, loc: locFrom(tt.start as any, tt.end as any) } as Text;
}

// parseComponent moved to components.ts


export function parseChevrotain(source: string, opts: ParseOptions = {}): Program {
  const debug = !!opts.debug;
  const log = opts.logger ?? ((m: string) => console.log(`[owt:parser-chev] ${m}`));
  if (debug) log(`lex start (len=${source.length})`);
  const lex = OwtLexer.tokenize(source);
  if (lex.errors?.length) {
    const e = lex.errors[0]!;
    throw new Error(`Lexer error at offset ${e.offset ?? -1}: ${e.message}`);
  }
  if (debug) log(`lex done (tokens=${lex.tokens.length})`);
  const comments = ((lex as any).groups && (lex as any).groups.comments) ? (lex as any).groups.comments : [];
  const r = new Reader(lex.tokens as Tok[], comments as any);
  const program = parseProgram(r, parseStatementOrNode);
  if (debug) log(`parse done (components=${program.body.length})`);
  return program;
}
