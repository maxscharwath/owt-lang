// Shared row generator for every benchmarked app.
//
// Labels use the standard js-framework-benchmark word lists, but the random
// source is a seeded PRNG (mulberry32) instead of Math.random(), so every
// framework renders exactly the same rows for the same sequence of actions.
// Ids and the PRNG state are module-level: they restart from scratch on
// every page load. The runner uses createDataGenerator() to replay the same
// sequence in Node and verify the DOM row by row.

export interface Row {
  id: number;
  label: string;
}

export const adjectives = [
  'pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome', 'plain', 'quaint',
  'clean', 'elegant', 'easy', 'angry', 'crazy', 'helpful', 'mushy', 'odd', 'unsightly',
  'adorable', 'important', 'inexpensive', 'cheap', 'expensive', 'fancy',
];
export const colours = [
  'red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown', 'white', 'black', 'orange',
];
export const nouns = [
  'table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie', 'sandwich', 'burger',
  'pizza', 'mouse', 'keyboard',
];

export const DEFAULT_SEED = 0x5eed1234;

export type BuildData = (count?: number) => Row[];

export function createDataGenerator(seed: number = DEFAULT_SEED): BuildData {
  let state = seed >>> 0;
  let nextId = 1;

  // mulberry32: tiny, fast, good enough distribution for picking words.
  function random(max: number): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) % 1000) % max;
  }

  return function buildData(count = 1000): Row[] {
    const data: Row[] = new Array(count);
    for (let i = 0; i < count; i++) {
      data[i] = {
        id: nextId++,
        label: `${adjectives[random(adjectives.length)]} ${colours[random(colours.length)]} ${nouns[random(nouns.length)]}`,
      };
    }
    return data;
  };
}

export const buildData: BuildData = createDataGenerator();
