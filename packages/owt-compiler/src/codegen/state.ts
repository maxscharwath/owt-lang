import type { CompilerContext } from '../context';

export let currentVarNames: string[] = [];
export let currentValInits: Record<string, string> = Object.create(null);
export let currentValDeps: Record<string, string[]> = Object.create(null);
export let currentContext: CompilerContext | null = null;
export let currentParamMapping: Record<string, string> = Object.create(null);

export function setCurrentState(options: {
  varNames: string[];
  valInits: Record<string, string>;
  valDeps: Record<string, string[]>;
  context: CompilerContext | null;
  paramMapping?: Record<string, string>;
}) {
  currentVarNames = options.varNames;
  currentValInits = options.valInits;
  currentValDeps = options.valDeps;
  currentContext = options.context;
  currentParamMapping = options.paramMapping || Object.create(null);
}

