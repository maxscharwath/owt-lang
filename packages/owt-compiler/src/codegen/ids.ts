let idCounter = 0;

export function resetIds() {
  idCounter = 0;
}

export function uid(prefix: string): string {
  return `_${prefix}_${(idCounter++).toString(36)}`;
}

