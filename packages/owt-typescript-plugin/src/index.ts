/**
 * TypeScript server plugin: lets `.ts` files import `.owt` components with
 * full types (completions, go-to-definition, find references...).
 */
import { createLanguageServicePlugin } from '@volar/typescript/lib/quickstart/createLanguageServicePlugin';
import { createOwtLanguagePlugin } from '@owt/language-core';

const plugin = createLanguageServicePlugin((ts) => ({
  languagePlugins: [createOwtLanguagePlugin<string>(ts)],
}));

export = plugin;
