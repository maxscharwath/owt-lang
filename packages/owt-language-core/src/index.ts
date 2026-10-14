/**
 * OWT language plugin for Volar. Used by the language server, the
 * TypeScript server plugin and `owt-tsc`.
 */
import type { LanguagePlugin } from '@volar/language-core';
import type {} from '@volar/typescript';
import type * as ts from 'typescript';
import { OwtVirtualCode } from './virtual-code';

export { OwtVirtualCode } from './virtual-code';
export { generate, type Generated } from './codegen';
export { format, type FormatEdit, type FormatOptions } from './format';

type UriLike = string | { path: string };

function pathOf(id: UriLike): string {
  return typeof id === 'string' ? id : id.path;
}

/** Create the Volar language plugin (`T` is a file name in tsserver/tsc, a URI in the language server). */
export function createOwtLanguagePlugin<T extends UriLike>(typescript: typeof ts): LanguagePlugin<T, OwtVirtualCode> {
  return {
    getLanguageId(id) {
      return pathOf(id).endsWith('.owt') ? 'owt' : undefined;
    },
    createVirtualCode(_id, languageId, snapshot) {
      if (languageId !== 'owt') return undefined;
      return new OwtVirtualCode(snapshot);
    },
    updateVirtualCode(_id, code, snapshot) {
      code.update(snapshot);
      return code;
    },
    typescript: {
      extraFileExtensions: [{ extension: 'owt', isMixedContent: true, scriptKind: typescript.ScriptKind.Deferred }],
      getServiceScript(root) {
        const code = root instanceof OwtVirtualCode ? root.typescript : root.embeddedCodes?.find((c) => c.id === 'ts');
        if (code === undefined) return undefined;
        return { code, extension: '.ts', scriptKind: typescript.ScriptKind.TS };
      },
    },
  };
}
