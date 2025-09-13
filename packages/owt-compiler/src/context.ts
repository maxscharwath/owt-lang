/**
 * Context management for OWT compiler
 * Replaces global state variables with proper context management
 */

export interface CompilerContext {
  varNames: string[];
  valInits: Record<string, string>;
  valDeps: Record<string, string[]>;
  idCounter: number;
}

export function createCompilerContext(): CompilerContext {
  return {
    varNames: [],
    valInits: Object.create(null),
    valDeps: Object.create(null),
    idCounter: 0
  };
}

export function resetContext(context: CompilerContext): void {
  context.varNames = [];
  context.valInits = Object.create(null);
  context.valDeps = Object.create(null);
  context.idCounter = 0;
}

export function addVariable(context: CompilerContext, name: string): void {
  if (!context.varNames.includes(name)) {
    context.varNames.push(name);
  }
}

export function addValInit(context: CompilerContext, name: string, init: string): void {
  context.valInits[name] = init;
}

export function addValDeps(context: CompilerContext, name: string, deps: string[]): void {
  context.valDeps[name] = deps;
}

export function generateId(context: CompilerContext, prefix: string): string {
  return `_${prefix}_${(context.idCounter++).toString(36)}`;
}

export function getVariableNames(context: CompilerContext): string[] {
  return [...context.varNames];
}

export function getValInit(context: CompilerContext, name: string): string | undefined {
  return context.valInits[name];
}

export function getValDeps(context: CompilerContext, name: string): string[] {
  return context.valDeps[name] || [];
}
