/** Development checks are compiled out by bundlers that replace `import.meta.env.DEV`. */
type EnvMeta = { env?: { DEV?: boolean } };

export const DEV: boolean = (import.meta as ImportMeta & EnvMeta).env?.DEV !== false;
