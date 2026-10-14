/**
 * Built-in transitions for `transition:`, `in:` and `out:`.
 *
 * ```owt
 * import { fade, fly } from 'owt/transition'
 * if (open) {
 *   <div transition:fade>...</div>
 *   <aside in:fly={{ x: -200 }} out:fade={{ duration: 150 }}>...</aside>
 * }
 * ```
 *
 * A transition is any function `(node, params, { direction }) => TransitionConfig`
 * returning Web Animations keyframes from the hidden to the visible state.
 */
import type { TransitionConfig } from './dom/transitions';

export type { Transition, TransitionConfig, TransitionDirection } from './dom/transitions';

/** Common timing options. */
export type TransitionTiming = {
  /** ms before the transition starts */
  delay?: number;
  /** ms */
  duration?: number;
  /** CSS easing function (`ease-out`, `cubic-bezier(...)`, `linear(...)` or a constant below) */
  easing?: string;
};

export const linear = 'linear';
export const cubicIn = 'cubic-bezier(0.32, 0, 0.67, 0)';
export const cubicOut = 'cubic-bezier(0.33, 1, 0.68, 1)';
export const cubicInOut = 'cubic-bezier(0.65, 0, 0.35, 1)';
export const quintOut = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const expoOut = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const backOut = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

function length(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value;
}

function opacityOf(style: CSSStyleDeclaration): number {
  const value = parseFloat(style.opacity);
  return Number.isNaN(value) ? 1 : value;
}

function baseTransform(style: CSSStyleDeclaration): string {
  return style.transform === 'none' || style.transform === '' ? '' : `${style.transform} `;
}

function timing(params: TransitionTiming, duration: number, easing: string): Omit<TransitionConfig, 'keyframes'> {
  return { delay: params.delay ?? 0, duration: params.duration ?? duration, easing: params.easing ?? easing };
}

/** Fade the opacity in or out. */
export function fade(node: Element, params: TransitionTiming = {}): TransitionConfig {
  const opacity = opacityOf(getComputedStyle(node));
  return { ...timing(params, 300, linear), keyframes: [{ opacity: 0 }, { opacity }] };
}

export type FlyParams = TransitionTiming & {
  /** horizontal offset of the hidden state (number = px) */
  x?: number | string;
  /** vertical offset of the hidden state (number = px) */
  y?: number | string;
  /** opacity of the hidden state, relative to the element's opacity (default 0) */
  opacity?: number;
};

/** Move from an offset and fade. */
export function fly(node: Element, params: FlyParams = {}): TransitionConfig {
  const style = getComputedStyle(node);
  const target = opacityOf(style);
  const base = baseTransform(style);
  const x = length(params.x ?? 0);
  const y = length(params.y ?? 0);
  return {
    ...timing(params, 400, cubicOut),
    keyframes: [
      { transform: `${base}translate(${x}, ${y})`, opacity: target * (params.opacity ?? 0) },
      { transform: `${base}translate(0px, 0px)`, opacity: target },
    ],
  };
}

export type ScaleParams = TransitionTiming & {
  /** scale of the hidden state (default 0) */
  start?: number;
  /** opacity of the hidden state, relative to the element's opacity (default 0) */
  opacity?: number;
};

/** Grow from a smaller scale and fade. */
export function scale(node: Element, params: ScaleParams = {}): TransitionConfig {
  const style = getComputedStyle(node);
  const target = opacityOf(style);
  const base = baseTransform(style);
  return {
    ...timing(params, 300, cubicOut),
    keyframes: [
      { transform: `${base}scale(${params.start ?? 0})`, opacity: target * (params.opacity ?? 0) },
      { transform: `${base}scale(1)`, opacity: target },
    ],
  };
}

export type BlurParams = TransitionTiming & {
  /** blur radius of the hidden state (number = px, default 5) */
  amount?: number | string;
  /** opacity of the hidden state, relative to the element's opacity (default 0) */
  opacity?: number;
};

/** Blur and fade. */
export function blur(node: Element, params: BlurParams = {}): TransitionConfig {
  const style = getComputedStyle(node);
  const target = opacityOf(style);
  const base = style.filter === 'none' || style.filter === '' ? '' : `${style.filter} `;
  return {
    ...timing(params, 400, cubicInOut),
    keyframes: [
      { filter: `${base}blur(${length(params.amount ?? 5)})`, opacity: target * (params.opacity ?? 0) },
      { filter: `${base}blur(0px)`, opacity: target },
    ],
  };
}

export type SlideParams = TransitionTiming & {
  /** `y` (default) slides the height, `x` the width */
  axis?: 'x' | 'y';
};

/** Slide the element's height (or width) open and closed. */
export function slide(node: Element, params: SlideParams = {}): TransitionConfig {
  const style = getComputedStyle(node);
  const [size, a, b] = params.axis === 'x' ? (['width', 'Left', 'Right'] as const) : (['height', 'Top', 'Bottom'] as const);
  const closed: Keyframe = { [size]: '0px', overflow: 'hidden' };
  const open: Keyframe = { [size]: style[size], overflow: 'hidden' };
  for (const side of [a, b]) {
    for (const prop of [`padding${side}`, `margin${side}`, `border${side}Width`] as const) {
      closed[prop] = '0px';
      open[prop] = style[prop];
    }
  }
  return { ...timing(params, 400, cubicOut), keyframes: [closed, open] };
}
