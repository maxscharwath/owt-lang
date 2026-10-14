import { RequestType } from 'vscode-languageclient/node';

/** Custom requests understood by `@owt/language-server`. */

export type VirtualCodeParams = {
  /** URI of the `.owt` document, exactly as the client sent it to the server. */
  uri: string;
};

export type VirtualCodeResult = {
  /** The generated TypeScript the language server type-checks for this document. */
  code: string;
} | null;

/** `owt/virtualCode`: returns the virtual TypeScript code generated for an `.owt` document. */
export const VirtualCodeRequest = new RequestType<VirtualCodeParams, VirtualCodeResult, void>('owt/virtualCode');
