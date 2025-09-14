import { parse } from '@owt/parser';

export type ExtractedComponent = { name: string; propsType: string };

export function extractComponentsFromSource(source: string): ExtractedComponent[] {
  try {
    const ast: any = parse(source, { debug: false });
    const out: ExtractedComponent[] = [];
    for (const n of ast.body || []) {
      if (n?.type === 'Component' && n.export) {
        const name = n.name || 'Component';
        const propsType = (n.props?.typeAnnotation?.code) || 'any';
        out.push({ name, propsType });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function extractComponentsFromAst(ast: any): any[] {
  const out: any[] = [];
  try {
    for (const n of ast.body || []) {
      if (n?.type === 'Component' && n.export) out.push(n);
    }
  } catch {}
  return out;
}

export function extractTopLevelExportCode(source: string): string[] {
  try {
    const ast: any = parse(source, { debug: false });
    const parts: string[] = [];
    for (const n of ast.body || []) {
      if (n?.export && (n.type === 'TypeDecl' || n.type === 'InterfaceDecl' || n.type === 'FunctionDecl' || n.type === 'ConstDecl' || n.type === 'LetDecl' || n.type === 'VarDecl')) {
        if (n.code) parts.push(n.code);
      }
    }
    return parts;
  } catch {
    return [];
  }
}


