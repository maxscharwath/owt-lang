let idCounter = 0;
let minifyMode = false;

export function resetIds() {
  idCounter = 0;
}

export function uid(prefix: string): string {
  if (minifyMode) {
    // Use very short variable names in minify mode
    const shortPrefixes: Record<string, string> = {
      'el': 'e',
      'ctx': 'c',
      'cont': 'ct',
      'inst': 'i',
      'props': 'p',
      'tn': 't',
      'u': 'u',
      'cStart': 's',
      'cEnd': 'e',
      'root': 'r',
      'frag': 'f',
      'tmp': 't',
      'anchor': 'a',
      'end': 'e',
      'src': 's',
      'seen': 's',
      'meta': 'm',
      'index': 'i',
      'length': 'l'
    };
    const shortPrefix = shortPrefixes[prefix] || prefix.charAt(0);
    return `${shortPrefix}${(idCounter++).toString(36)}`;
  }
  return `_${prefix}_${(idCounter++).toString(36)}`;
}

export function setMinifyMode(minify: boolean): void {
  minifyMode = minify;
}

