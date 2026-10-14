/**
 * Type-only descriptions of the HTML, SVG and MathML elements OWT markup can
 * use, and of the attributes each one accepts.
 *
 * Editor tooling type-checks markup by generating calls such as
 *
 *   __owt.el("input", { type: "text", value: draft, onInput: (event) => {} });
 *
 * against `el<K extends keyof OwtElements>(tag: K, attrs: OwtElements[K])`.
 * Object-literal excess property checks therefore flag misspelt attributes,
 * while `data-*` and `aria-*` names are accepted through template-literal
 * index signatures. Event handler parameters are contextually typed with the
 * DOM event type and the element as `currentTarget`.
 *
 * Conventions:
 * - attribute names are written the way they appear in markup (`tabindex`,
 *   `readonly`, `stroke-width`); event handlers use camelCase `onX` names;
 * - every attribute also accepts `null | undefined` (meaning "absent"), which
 *   matters under `exactOptionalPropertyTypes`;
 * - numeric attributes accept `string | number`, boolean attributes `boolean`.
 *
 * This module contains no runtime code and is erased entirely on compilation.
 */

// ===========================================================================
// Shared value types
// ===========================================================================

/** `class` values: strings, numbers, nested arrays and `{ name: condition }` objects (clsx semantics). */
export type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly ClassValue[]
  | Record<string, unknown>;

/**
 * `style` objects: camelCase CSS properties plus `--custom` properties.
 *
 * The value test runs on the plain key first: narrowing `K` to `string` before
 * indexing `CSSStyleDeclaration[K]` makes the checker relate `K & string` to
 * every one of the ~540 keys, which costs over a second per program.
 */
export type StyleObject = {
  [K in keyof CSSStyleDeclaration as CSSStyleDeclaration[K] extends string
    ? K extends number | 'cssText'
      ? never
      : K
    : never]?: string | number | null | undefined;
} & { [key: `--${string}`]: string | number | null | undefined };

/** A value that is `null | undefined` or `T`. Every attribute is optional and nullable. */
type Attr<T> = T | null | undefined;

/** Enumerated `"true" | "false"` attributes that also take booleans. */
export type Booleanish = boolean | 'true' | 'false';

/** Attributes whose value is a number in HTML (also accepted as a string). */
export type Numberish = string | number;

/** A string union that still accepts any other string while keeping editor completions. */
type OpenString<T extends string> = T | (string & {});

export type CrossOrigin = boolean | '' | 'anonymous' | 'use-credentials';
export type HTMLAttributeReferrerPolicy = ReferrerPolicy;
export type HTMLAttributeAnchorTarget = OpenString<'_self' | '_blank' | '_parent' | '_top' | '_unfencedTop'>;
export type FetchPriority = 'high' | 'low' | 'auto';
export type LoadingStrategy = 'eager' | 'lazy';
export type FormMethod = 'get' | 'post' | 'dialog' | 'GET' | 'POST' | 'DIALOG';
export type FormEnctype = 'application/x-www-form-urlencoded' | 'multipart/form-data' | 'text/plain';
export type PopoverTargetAction = 'show' | 'hide' | 'toggle';

export type HTMLInputTypeAttribute = OpenString<
  | 'button'
  | 'checkbox'
  | 'color'
  | 'date'
  | 'datetime-local'
  | 'email'
  | 'file'
  | 'hidden'
  | 'image'
  | 'month'
  | 'number'
  | 'password'
  | 'radio'
  | 'range'
  | 'reset'
  | 'search'
  | 'submit'
  | 'tel'
  | 'text'
  | 'time'
  | 'url'
  | 'week'
>;

/** `autocomplete` tokens (https://html.spec.whatwg.org/#autofill), open to any combination. */
export type AutoCompleteValue = OpenString<
  | 'on'
  | 'off'
  | 'name'
  | 'honorific-prefix'
  | 'given-name'
  | 'additional-name'
  | 'family-name'
  | 'honorific-suffix'
  | 'nickname'
  | 'email'
  | 'username'
  | 'new-password'
  | 'current-password'
  | 'one-time-code'
  | 'organization-title'
  | 'organization'
  | 'street-address'
  | 'address-line1'
  | 'address-line2'
  | 'address-line3'
  | 'address-level1'
  | 'address-level2'
  | 'address-level3'
  | 'address-level4'
  | 'country'
  | 'country-name'
  | 'postal-code'
  | 'cc-name'
  | 'cc-given-name'
  | 'cc-additional-name'
  | 'cc-family-name'
  | 'cc-number'
  | 'cc-exp'
  | 'cc-exp-month'
  | 'cc-exp-year'
  | 'cc-csc'
  | 'cc-type'
  | 'transaction-currency'
  | 'transaction-amount'
  | 'language'
  | 'bday'
  | 'bday-day'
  | 'bday-month'
  | 'bday-year'
  | 'sex'
  | 'tel'
  | 'tel-country-code'
  | 'tel-national'
  | 'tel-area-code'
  | 'tel-local'
  | 'tel-extension'
  | 'impp'
  | 'url'
  | 'photo'
  | 'webauthn'
>;

/** WAI-ARIA 1.2 / 1.3 roles. */
export type AriaRole = OpenString<
  | 'alert'
  | 'alertdialog'
  | 'application'
  | 'article'
  | 'banner'
  | 'blockquote'
  | 'button'
  | 'caption'
  | 'cell'
  | 'checkbox'
  | 'code'
  | 'columnheader'
  | 'combobox'
  | 'comment'
  | 'complementary'
  | 'contentinfo'
  | 'definition'
  | 'deletion'
  | 'dialog'
  | 'directory'
  | 'document'
  | 'emphasis'
  | 'feed'
  | 'figure'
  | 'form'
  | 'generic'
  | 'grid'
  | 'gridcell'
  | 'group'
  | 'heading'
  | 'img'
  | 'insertion'
  | 'link'
  | 'list'
  | 'listbox'
  | 'listitem'
  | 'log'
  | 'main'
  | 'mark'
  | 'marquee'
  | 'math'
  | 'menu'
  | 'menubar'
  | 'menuitem'
  | 'menuitemcheckbox'
  | 'menuitemradio'
  | 'meter'
  | 'navigation'
  | 'none'
  | 'note'
  | 'option'
  | 'paragraph'
  | 'presentation'
  | 'progressbar'
  | 'radio'
  | 'radiogroup'
  | 'region'
  | 'row'
  | 'rowgroup'
  | 'rowheader'
  | 'scrollbar'
  | 'search'
  | 'searchbox'
  | 'separator'
  | 'slider'
  | 'spinbutton'
  | 'status'
  | 'strong'
  | 'subscript'
  | 'suggestion'
  | 'superscript'
  | 'switch'
  | 'tab'
  | 'table'
  | 'tablist'
  | 'tabpanel'
  | 'term'
  | 'textbox'
  | 'time'
  | 'timer'
  | 'toolbar'
  | 'tooltip'
  | 'tree'
  | 'treegrid'
  | 'treeitem'
>;

// ===========================================================================
// Events
// ===========================================================================

/**
 * An event handler prop. `currentTarget` is the element the handler is bound
 * to; `target` is narrowed to `Element` (the node the event was dispatched on).
 */
export type EventHandler<E extends Event, T extends EventTarget> = (
  event: E & { currentTarget: T; target: Element },
) => unknown;

/**
 * DOM event name to event type. The lib.dom maps, with a few refinements
 * where lib.dom only says `Event`.
 */
export interface OwtEventMap extends HTMLVideoElementEventMap {
  command: CommandEvent;
  contentvisibilityautostatechange: ContentVisibilityAutoStateChangeEvent;
}

/** Event handler prop name to DOM event name, for events every element can receive. */
export type GlobalEventProps = {
  // Clipboard
  onCopy: 'copy';
  onCut: 'cut';
  onPaste: 'paste';

  // Composition
  onCompositionEnd: 'compositionend';
  onCompositionStart: 'compositionstart';
  onCompositionUpdate: 'compositionupdate';

  // Focus
  onBlur: 'blur';
  onFocus: 'focus';
  onFocusIn: 'focusin';
  onFocusOut: 'focusout';

  // Forms and text input
  onBeforeInput: 'beforeinput';
  onChange: 'change';
  onFormData: 'formdata';
  onInput: 'input';
  onInvalid: 'invalid';
  onReset: 'reset';
  onSelect: 'select';
  onSelectionChange: 'selectionchange';
  onSelectStart: 'selectstart';
  onSubmit: 'submit';

  // Keyboard
  onKeyDown: 'keydown';
  onKeyPress: 'keypress';
  onKeyUp: 'keyup';

  // Mouse
  onAuxClick: 'auxclick';
  onClick: 'click';
  onContextMenu: 'contextmenu';
  onDblClick: 'dblclick';
  onDoubleClick: 'dblclick';
  onMouseDown: 'mousedown';
  onMouseEnter: 'mouseenter';
  onMouseLeave: 'mouseleave';
  onMouseMove: 'mousemove';
  onMouseOut: 'mouseout';
  onMouseOver: 'mouseover';
  onMouseUp: 'mouseup';

  // Pointer
  onGotPointerCapture: 'gotpointercapture';
  onLostPointerCapture: 'lostpointercapture';
  onPointerCancel: 'pointercancel';
  onPointerDown: 'pointerdown';
  onPointerEnter: 'pointerenter';
  onPointerLeave: 'pointerleave';
  onPointerMove: 'pointermove';
  onPointerOut: 'pointerout';
  onPointerOver: 'pointerover';
  onPointerRawUpdate: 'pointerrawupdate';
  onPointerUp: 'pointerup';

  // Touch
  onTouchCancel: 'touchcancel';
  onTouchEnd: 'touchend';
  onTouchMove: 'touchmove';
  onTouchStart: 'touchstart';

  // Drag and drop
  onDrag: 'drag';
  onDragEnd: 'dragend';
  onDragEnter: 'dragenter';
  onDragLeave: 'dragleave';
  onDragOver: 'dragover';
  onDragStart: 'dragstart';
  onDrop: 'drop';

  // Wheel, scroll and resize
  onWheel: 'wheel';
  onScroll: 'scroll';
  onScrollEnd: 'scrollend';
  onResize: 'resize';

  // CSS animations and transitions
  onAnimationCancel: 'animationcancel';
  onAnimationEnd: 'animationend';
  onAnimationIteration: 'animationiteration';
  onAnimationStart: 'animationstart';
  onTransitionCancel: 'transitioncancel';
  onTransitionEnd: 'transitionend';
  onTransitionRun: 'transitionrun';
  onTransitionStart: 'transitionstart';

  // Media (audio, video, track)
  onAbort: 'abort';
  onCanPlay: 'canplay';
  onCanPlayThrough: 'canplaythrough';
  onCueChange: 'cuechange';
  onDurationChange: 'durationchange';
  onEmptied: 'emptied';
  onEnded: 'ended';
  onLoadedData: 'loadeddata';
  onLoadedMetadata: 'loadedmetadata';
  onLoadStart: 'loadstart';
  onPause: 'pause';
  onPlay: 'play';
  onPlaying: 'playing';
  onProgress: 'progress';
  onRateChange: 'ratechange';
  onSeeked: 'seeked';
  onSeeking: 'seeking';
  onStalled: 'stalled';
  onSuspend: 'suspend';
  onTimeUpdate: 'timeupdate';
  onVolumeChange: 'volumechange';
  onWaiting: 'waiting';

  // Resource loading
  onError: 'error';
  onLoad: 'load';

  // Dialogs, popovers, details, invokers
  onBeforeMatch: 'beforematch';
  onBeforeToggle: 'beforetoggle';
  onCancel: 'cancel';
  onClose: 'close';
  onCommand: 'command';
  onToggle: 'toggle';

  // Canvas
  onContextLost: 'contextlost';
  onContextRestored: 'contextrestored';

  // Shadow DOM, rendering, security
  onSlotChange: 'slotchange';
  onContentVisibilityAutoStateChange: 'contentvisibilityautostatechange';
  onSecurityPolicyViolation: 'securitypolicyviolation';

  // Fullscreen
  onFullscreenChange: 'fullscreenchange';
  onFullscreenError: 'fullscreenerror';

  // Legacy prefixed events
  onWebkitAnimationEnd: 'webkitanimationend';
  onWebkitAnimationIteration: 'webkitanimationiteration';
  onWebkitAnimationStart: 'webkitanimationstart';
  onWebkitTransitionEnd: 'webkittransitionend';
};

/** Events only `<audio>` and `<video>` receive. */
export type MediaEventProps = {
  onEncrypted: 'encrypted';
  onWaitingForKey: 'waitingforkey';
};

/** Events only `<video>` receives. */
export type VideoEventProps = {
  onEnterPictureInPicture: 'enterpictureinpicture';
  onLeavePictureInPicture: 'leavepictureinpicture';
};

/** `onX` props for every entry of an event prop map. */
export type EventHandlerProps<M extends Record<string, keyof OwtEventMap>, T extends EventTarget> = {
  [K in keyof M]?: EventHandler<OwtEventMap[M[K]], T> | null | undefined;
};

/** `onXCapture` props (capture-phase listeners) for every entry of an event prop map. */
export type CaptureEventHandlerProps<M extends Record<string, keyof OwtEventMap>, T extends EventTarget> = {
  [K in keyof M as `${K & string}Capture`]?: EventHandler<OwtEventMap[M[K]], T> | null | undefined;
};

/** Event handler props shared by every HTML and SVG element. */
export interface DOMAttributes<T extends EventTarget>
  extends EventHandlerProps<GlobalEventProps, T>,
    CaptureEventHandlerProps<GlobalEventProps, T> {}

// ===========================================================================
// ARIA and data attributes
// ===========================================================================

/** WAI-ARIA states and properties (https://www.w3.org/TR/wai-aria-1.2/#state_prop_def). */
export interface AriaAttributes {
  'aria-activedescendant'?: Attr<string>;
  'aria-atomic'?: Attr<Booleanish>;
  'aria-autocomplete'?: Attr<'none' | 'inline' | 'list' | 'both'>;
  'aria-braillelabel'?: Attr<string>;
  'aria-brailleroledescription'?: Attr<string>;
  'aria-busy'?: Attr<Booleanish>;
  'aria-checked'?: Attr<Booleanish | 'mixed'>;
  'aria-colcount'?: Attr<Numberish>;
  'aria-colindex'?: Attr<Numberish>;
  'aria-colindextext'?: Attr<string>;
  'aria-colspan'?: Attr<Numberish>;
  'aria-controls'?: Attr<string>;
  'aria-current'?: Attr<Booleanish | 'page' | 'step' | 'location' | 'date' | 'time'>;
  'aria-describedby'?: Attr<string>;
  'aria-description'?: Attr<string>;
  'aria-details'?: Attr<string>;
  'aria-disabled'?: Attr<Booleanish>;
  /** @deprecated in ARIA 1.1 */
  'aria-dropeffect'?: Attr<'none' | 'copy' | 'execute' | 'link' | 'move' | 'popup'>;
  'aria-errormessage'?: Attr<string>;
  'aria-expanded'?: Attr<Booleanish>;
  'aria-flowto'?: Attr<string>;
  /** @deprecated in ARIA 1.1 */
  'aria-grabbed'?: Attr<Booleanish>;
  'aria-haspopup'?: Attr<Booleanish | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog'>;
  'aria-hidden'?: Attr<Booleanish>;
  'aria-invalid'?: Attr<Booleanish | 'grammar' | 'spelling'>;
  'aria-keyshortcuts'?: Attr<string>;
  'aria-label'?: Attr<string>;
  'aria-labelledby'?: Attr<string>;
  'aria-level'?: Attr<Numberish>;
  'aria-live'?: Attr<'off' | 'assertive' | 'polite'>;
  'aria-modal'?: Attr<Booleanish>;
  'aria-multiline'?: Attr<Booleanish>;
  'aria-multiselectable'?: Attr<Booleanish>;
  'aria-orientation'?: Attr<'horizontal' | 'vertical' | 'undefined'>;
  'aria-owns'?: Attr<string>;
  'aria-placeholder'?: Attr<string>;
  'aria-posinset'?: Attr<Numberish>;
  'aria-pressed'?: Attr<Booleanish | 'mixed'>;
  'aria-readonly'?: Attr<Booleanish>;
  'aria-relevant'?: Attr<OpenString<'additions' | 'additions removals' | 'additions text' | 'all' | 'removals' | 'removals additions' | 'removals text' | 'text' | 'text additions' | 'text removals'>>;
  'aria-required'?: Attr<Booleanish>;
  'aria-roledescription'?: Attr<string>;
  'aria-rowcount'?: Attr<Numberish>;
  'aria-rowindex'?: Attr<Numberish>;
  'aria-rowindextext'?: Attr<string>;
  'aria-rowspan'?: Attr<Numberish>;
  'aria-selected'?: Attr<Booleanish>;
  'aria-setsize'?: Attr<Numberish>;
  'aria-sort'?: Attr<'none' | 'ascending' | 'descending' | 'other'>;
  'aria-valuemax'?: Attr<Numberish>;
  'aria-valuemin'?: Attr<Numberish>;
  'aria-valuenow'?: Attr<Numberish>;
  'aria-valuetext'?: Attr<string>;
  /** Any other `aria-*` attribute. */
  [key: `aria-${string}`]: unknown;
}

/** `data-*` custom data attributes. */
export interface DatasetAttributes {
  [key: `data-${string}`]: unknown;
}

// ===========================================================================
// Global HTML attributes
// ===========================================================================

/** Attributes, DOM properties and event handlers every HTML element accepts. */
export interface HTMLAttributes<T extends EventTarget = HTMLElement>
  extends DOMAttributes<T>,
    AriaAttributes,
    DatasetAttributes {
  // Global attributes (https://html.spec.whatwg.org/#global-attributes)
  accesskey?: Attr<string>;
  autocapitalize?: Attr<'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters'>;
  autocorrect?: Attr<'on' | 'off' | ''>;
  autofocus?: Attr<boolean>;
  class?: ClassValue;
  contenteditable?: Attr<Booleanish | '' | 'plaintext-only' | 'inherit'>;
  dir?: Attr<'ltr' | 'rtl' | 'auto'>;
  draggable?: Attr<Booleanish>;
  enterkeyhint?: Attr<'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send'>;
  exportparts?: Attr<string>;
  hidden?: Attr<boolean | '' | 'hidden' | 'until-found'>;
  id?: Attr<string>;
  inert?: Attr<boolean>;
  inputmode?: Attr<'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url'>;
  is?: Attr<string>;
  lang?: Attr<string>;
  nonce?: Attr<string>;
  part?: Attr<string>;
  popover?: Attr<boolean | '' | 'auto' | 'manual' | 'hint'>;
  role?: Attr<AriaRole>;
  slot?: Attr<string>;
  spellcheck?: Attr<Booleanish>;
  style?: Attr<string | StyleObject>;
  tabindex?: Attr<Numberish>;
  title?: Attr<string>;
  translate?: Attr<'yes' | 'no'>;
  virtualkeyboardpolicy?: Attr<'auto' | 'manual'>;
  writingsuggestions?: Attr<Booleanish>;

  // Microdata
  itemid?: Attr<string>;
  itemprop?: Attr<string>;
  itemref?: Attr<string>;
  itemscope?: Attr<boolean>;
  itemtype?: Attr<string>;

  // DOM properties set directly on the element
  innerHTML?: Attr<string>;
  innerText?: Attr<string | number>;
  textContent?: Attr<string | number>;
  scrollLeft?: Attr<number>;
  scrollTop?: Attr<number>;
}

// ===========================================================================
// Element-specific HTML attributes
// ===========================================================================

/** `<a>` */
export interface AnchorAttributes extends HTMLAttributes<HTMLAnchorElement> {
  download?: Attr<boolean | string>;
  href?: Attr<string>;
  hreflang?: Attr<string>;
  ping?: Attr<string>;
  referrerpolicy?: Attr<HTMLAttributeReferrerPolicy>;
  rel?: Attr<string>;
  target?: Attr<HTMLAttributeAnchorTarget>;
  type?: Attr<string>;
}

/** `<area>` */
export interface AreaAttributes extends HTMLAttributes<HTMLAreaElement> {
  alt?: Attr<string>;
  coords?: Attr<string>;
  download?: Attr<boolean | string>;
  href?: Attr<string>;
  hreflang?: Attr<string>;
  ping?: Attr<string>;
  referrerpolicy?: Attr<HTMLAttributeReferrerPolicy>;
  rel?: Attr<string>;
  shape?: Attr<'rect' | 'circle' | 'poly' | 'default'>;
  target?: Attr<HTMLAttributeAnchorTarget>;
}

/** Shared by `<audio>` and `<video>`. */
export interface MediaAttributes<T extends HTMLMediaElement = HTMLMediaElement>
  extends HTMLAttributes<T>,
    EventHandlerProps<MediaEventProps, T>,
    CaptureEventHandlerProps<MediaEventProps, T> {
  autoplay?: Attr<boolean>;
  controls?: Attr<boolean>;
  controlslist?: Attr<OpenString<'nodownload' | 'nofullscreen' | 'noplaybackrate' | 'noremoteplayback'>>;
  crossorigin?: Attr<CrossOrigin>;
  disableremoteplayback?: Attr<boolean>;
  loop?: Attr<boolean>;
  muted?: Attr<boolean>;
  preload?: Attr<'' | 'none' | 'metadata' | 'auto'>;
  src?: Attr<string>;

  // DOM properties
  currentTime?: Attr<number>;
  playbackRate?: Attr<number>;
  srcObject?: Attr<MediaProvider>;
  volume?: Attr<number>;
}

/** `<audio>` */
export interface AudioAttributes extends MediaAttributes<HTMLAudioElement> {}

/** `<video>` */
export interface VideoAttributes
  extends MediaAttributes<HTMLVideoElement>,
    EventHandlerProps<VideoEventProps, HTMLVideoElement>,
    CaptureEventHandlerProps<VideoEventProps, HTMLVideoElement> {
  disablepictureinpicture?: Attr<boolean>;
  height?: Attr<Numberish>;
  playsinline?: Attr<boolean>;
  poster?: Attr<string>;
  width?: Attr<Numberish>;
}

/** `<base>` */
export interface BaseAttributes extends HTMLAttributes<HTMLBaseElement> {
  href?: Attr<string>;
  target?: Attr<HTMLAttributeAnchorTarget>;
}

/** `<blockquote>` */
export interface BlockquoteAttributes extends HTMLAttributes<HTMLQuoteElement> {
  cite?: Attr<string>;
}

/** `<q>` */
export interface QuoteAttributes extends HTMLAttributes<HTMLQuoteElement> {
  cite?: Attr<string>;
}

/** Built-in commands for `<button command>`; custom commands start with `--`. */
export type ButtonCommand =
  | 'show-modal'
  | 'close'
  | 'request-close'
  | 'show-popover'
  | 'hide-popover'
  | 'toggle-popover'
  | `--${string}`;

/** `<button>` */
export interface ButtonAttributes extends HTMLAttributes<HTMLButtonElement> {
  command?: Attr<ButtonCommand>;
  commandfor?: Attr<string>;
  disabled?: Attr<boolean>;
  form?: Attr<string>;
  formaction?: Attr<string>;
  formenctype?: Attr<FormEnctype>;
  formmethod?: Attr<FormMethod>;
  formnovalidate?: Attr<boolean>;
  formtarget?: Attr<HTMLAttributeAnchorTarget>;
  name?: Attr<string>;
  popovertarget?: Attr<string>;
  popovertargetaction?: Attr<PopoverTargetAction>;
  type?: Attr<'button' | 'submit' | 'reset'>;
  value?: Attr<string | number | readonly string[]>;
}

/** `<canvas>` */
export interface CanvasAttributes extends HTMLAttributes<HTMLCanvasElement> {
  height?: Attr<Numberish>;
  width?: Attr<Numberish>;
}

/** `<col>` and `<colgroup>` */
export interface ColAttributes extends HTMLAttributes<HTMLTableColElement> {
  span?: Attr<Numberish>;
  /** @deprecated use CSS */
  width?: Attr<Numberish>;
}

/** `<data>` */
export interface DataAttributes extends HTMLAttributes<HTMLDataElement> {
  value?: Attr<string | number>;
}

/** `<details>` */
export interface DetailsAttributes extends HTMLAttributes<HTMLDetailsElement> {
  name?: Attr<string>;
  open?: Attr<boolean>;
}

/** `<dialog>` */
export interface DialogAttributes extends HTMLAttributes<HTMLDialogElement> {
  closedby?: Attr<'any' | 'closerequest' | 'none'>;
  open?: Attr<boolean>;
}

/** `<del>` and `<ins>` */
export interface ModAttributes extends HTMLAttributes<HTMLModElement> {
  cite?: Attr<string>;
  datetime?: Attr<string>;
}

/** `<embed>` */
export interface EmbedAttributes extends HTMLAttributes<HTMLEmbedElement> {
  height?: Attr<Numberish>;
  src?: Attr<string>;
  type?: Attr<string>;
  width?: Attr<Numberish>;
}

/** `<fieldset>` */
export interface FieldsetAttributes extends HTMLAttributes<HTMLFieldSetElement> {
  disabled?: Attr<boolean>;
  form?: Attr<string>;
  name?: Attr<string>;
}

/** `<form>` */
export interface FormAttributes extends HTMLAttributes<HTMLFormElement> {
  'accept-charset'?: Attr<string>;
  /** Alias of `accept-charset`. */
  acceptCharset?: Attr<string>;
  action?: Attr<string>;
  autocomplete?: Attr<'on' | 'off'>;
  enctype?: Attr<FormEnctype>;
  method?: Attr<FormMethod>;
  name?: Attr<string>;
  novalidate?: Attr<boolean>;
  rel?: Attr<string>;
  target?: Attr<HTMLAttributeAnchorTarget>;
}

/** `<iframe>` */
export interface IframeAttributes extends HTMLAttributes<HTMLIFrameElement> {
  allow?: Attr<string>;
  allowfullscreen?: Attr<boolean>;
  credentialless?: Attr<boolean>;
  height?: Attr<Numberish>;
  loading?: Attr<LoadingStrategy>;
  name?: Attr<string>;
  referrerpolicy?: Attr<HTMLAttributeReferrerPolicy>;
  sandbox?: Attr<string>;
  src?: Attr<string>;
  srcdoc?: Attr<string>;
  width?: Attr<Numberish>;
}

/** `<img>` */
export interface ImgAttributes extends HTMLAttributes<HTMLImageElement> {
  alt?: Attr<string>;
  crossorigin?: Attr<CrossOrigin>;
  decoding?: Attr<'async' | 'auto' | 'sync'>;
  elementtiming?: Attr<string>;
  fetchpriority?: Attr<FetchPriority>;
  height?: Attr<Numberish>;
  ismap?: Attr<boolean>;
  loading?: Attr<LoadingStrategy>;
  referrerpolicy?: Attr<HTMLAttributeReferrerPolicy>;
  sizes?: Attr<string>;
  src?: Attr<string>;
  srcset?: Attr<string>;
  usemap?: Attr<string>;
  width?: Attr<Numberish>;
}

/** `<input>` */
export interface InputAttributes extends HTMLAttributes<HTMLInputElement> {
  accept?: Attr<string>;
  alt?: Attr<string>;
  autocomplete?: Attr<AutoCompleteValue>;
  capture?: Attr<boolean | 'user' | 'environment'>;
  checked?: Attr<boolean>;
  dirname?: Attr<string>;
  disabled?: Attr<boolean>;
  form?: Attr<string>;
  formaction?: Attr<string>;
  formenctype?: Attr<FormEnctype>;
  formmethod?: Attr<FormMethod>;
  formnovalidate?: Attr<boolean>;
  formtarget?: Attr<HTMLAttributeAnchorTarget>;
  height?: Attr<Numberish>;
  indeterminate?: Attr<boolean>;
  list?: Attr<string>;
  max?: Attr<Numberish>;
  maxlength?: Attr<Numberish>;
  min?: Attr<Numberish>;
  minlength?: Attr<Numberish>;
  multiple?: Attr<boolean>;
  name?: Attr<string>;
  pattern?: Attr<string>;
  placeholder?: Attr<string>;
  popovertarget?: Attr<string>;
  popovertargetaction?: Attr<PopoverTargetAction>;
  readonly?: Attr<boolean>;
  required?: Attr<boolean>;
  size?: Attr<Numberish>;
  src?: Attr<string>;
  step?: Attr<Numberish>;
  type?: Attr<HTMLInputTypeAttribute>;
  value?: Attr<string | number | readonly string[]>;
  webkitdirectory?: Attr<boolean>;
  width?: Attr<Numberish>;

  // DOM properties
  defaultChecked?: Attr<boolean>;
  defaultValue?: Attr<string | number>;
}

/** `<label>` */
export interface LabelAttributes extends HTMLAttributes<HTMLLabelElement> {
  for?: Attr<string>;
  /** Alias of `for`. */
  htmlFor?: Attr<string>;
}

/** `<li>` */
export interface LiAttributes extends HTMLAttributes<HTMLLIElement> {
  value?: Attr<Numberish>;
}

/** `<link>` */
export interface LinkAttributes extends HTMLAttributes<HTMLLinkElement> {
  as?: Attr<OpenString<'audio' | 'document' | 'embed' | 'fetch' | 'font' | 'image' | 'json' | 'object' | 'script' | 'style' | 'track' | 'video' | 'worker'>>;
  blocking?: Attr<'render'>;
  color?: Attr<string>;
  crossorigin?: Attr<CrossOrigin>;
  disabled?: Attr<boolean>;
  fetchpriority?: Attr<FetchPriority>;
  href?: Attr<string>;
  hreflang?: Attr<string>;
  imagesizes?: Attr<string>;
  imagesrcset?: Attr<string>;
  integrity?: Attr<string>;
  media?: Attr<string>;
  referrerpolicy?: Attr<HTMLAttributeReferrerPolicy>;
  rel?: Attr<string>;
  sizes?: Attr<string>;
  type?: Attr<string>;
}

/** `<map>` */
export interface MapAttributes extends HTMLAttributes<HTMLMapElement> {
  name?: Attr<string>;
}

/** `<meta>` */
export interface MetaAttributes extends HTMLAttributes<HTMLMetaElement> {
  charset?: Attr<string>;
  content?: Attr<string>;
  'http-equiv'?: Attr<OpenString<'content-security-policy' | 'content-type' | 'default-style' | 'refresh' | 'x-ua-compatible'>>;
  media?: Attr<string>;
  name?: Attr<string>;
  /** RDFa / Open Graph property name. */
  property?: Attr<string>;
}

/** `<meter>` */
export interface MeterAttributes extends HTMLAttributes<HTMLMeterElement> {
  form?: Attr<string>;
  high?: Attr<Numberish>;
  low?: Attr<Numberish>;
  max?: Attr<Numberish>;
  min?: Attr<Numberish>;
  optimum?: Attr<Numberish>;
  value?: Attr<Numberish>;
}

/** `<object>` */
export interface ObjectAttributes extends HTMLAttributes<HTMLObjectElement> {
  data?: Attr<string>;
  form?: Attr<string>;
  height?: Attr<Numberish>;
  name?: Attr<string>;
  type?: Attr<string>;
  width?: Attr<Numberish>;
}

/** `<ol>` */
export interface OlAttributes extends HTMLAttributes<HTMLOListElement> {
  reversed?: Attr<boolean>;
  start?: Attr<Numberish>;
  type?: Attr<'1' | 'a' | 'A' | 'i' | 'I'>;
}

/** `<optgroup>` */
export interface OptgroupAttributes extends HTMLAttributes<HTMLOptGroupElement> {
  disabled?: Attr<boolean>;
  label?: Attr<string>;
}

/** `<option>`: `value` may be any value (OWT keeps non-string values for `<select>` bindings). */
export interface OptionAttributes extends HTMLAttributes<HTMLOptionElement> {
  disabled?: Attr<boolean>;
  label?: Attr<string>;
  selected?: Attr<boolean>;
  value?: unknown;
}

/** `<output>` */
export interface OutputAttributes extends HTMLAttributes<HTMLOutputElement> {
  for?: Attr<string>;
  form?: Attr<string>;
  name?: Attr<string>;
}

/** `<progress>` */
export interface ProgressAttributes extends HTMLAttributes<HTMLProgressElement> {
  max?: Attr<Numberish>;
  value?: Attr<Numberish>;
}

/** `<script>` */
export interface ScriptAttributes extends HTMLAttributes<HTMLScriptElement> {
  async?: Attr<boolean>;
  blocking?: Attr<'render'>;
  crossorigin?: Attr<CrossOrigin>;
  defer?: Attr<boolean>;
  fetchpriority?: Attr<FetchPriority>;
  integrity?: Attr<string>;
  nomodule?: Attr<boolean>;
  referrerpolicy?: Attr<HTMLAttributeReferrerPolicy>;
  src?: Attr<string>;
  type?: Attr<OpenString<'module' | 'importmap' | 'speculationrules' | 'text/javascript'>>;
}

/** `<select>`: `value` may be any value (matched against `<option value>`). */
export interface SelectAttributes extends HTMLAttributes<HTMLSelectElement> {
  autocomplete?: Attr<AutoCompleteValue>;
  disabled?: Attr<boolean>;
  form?: Attr<string>;
  multiple?: Attr<boolean>;
  name?: Attr<string>;
  required?: Attr<boolean>;
  size?: Attr<Numberish>;
  value?: unknown;
}

/** `<slot>` */
export interface SlotAttributes extends HTMLAttributes<HTMLSlotElement> {
  name?: Attr<string>;
}

/** `<source>` */
export interface SourceAttributes extends HTMLAttributes<HTMLSourceElement> {
  height?: Attr<Numberish>;
  media?: Attr<string>;
  sizes?: Attr<string>;
  src?: Attr<string>;
  srcset?: Attr<string>;
  type?: Attr<string>;
  width?: Attr<Numberish>;
}

/** `<style>` */
export interface StyleAttributes extends HTMLAttributes<HTMLStyleElement> {
  blocking?: Attr<'render'>;
  media?: Attr<string>;
}

/** `<table>` (presentational attributes are legacy; prefer CSS). */
export interface TableAttributes extends HTMLAttributes<HTMLTableElement> {
  /** @deprecated use CSS */
  align?: Attr<'left' | 'center' | 'right'>;
  /** @deprecated use CSS */
  bgcolor?: Attr<string>;
  /** @deprecated use CSS */
  border?: Attr<Numberish>;
  /** @deprecated use CSS */
  cellpadding?: Attr<Numberish>;
  /** @deprecated use CSS */
  cellspacing?: Attr<Numberish>;
  /** @deprecated use CSS */
  frame?: Attr<'void' | 'above' | 'below' | 'hsides' | 'lhs' | 'rhs' | 'vsides' | 'box' | 'border'>;
  /** @deprecated use CSS */
  rules?: Attr<'none' | 'groups' | 'rows' | 'columns' | 'all'>;
  /** @deprecated use `<caption>` */
  summary?: Attr<string>;
  /** @deprecated use CSS */
  width?: Attr<Numberish>;
}

/** Shared by `<td>` and `<th>`. */
interface TableCellAttributes extends HTMLAttributes<HTMLTableCellElement> {
  abbr?: Attr<string>;
  /** @deprecated use CSS */
  align?: Attr<'left' | 'center' | 'right' | 'justify' | 'char'>;
  colspan?: Attr<Numberish>;
  headers?: Attr<string>;
  /** @deprecated use CSS */
  height?: Attr<Numberish>;
  rowspan?: Attr<Numberish>;
  scope?: Attr<'row' | 'col' | 'rowgroup' | 'colgroup'>;
  /** @deprecated use CSS */
  valign?: Attr<'top' | 'middle' | 'bottom' | 'baseline'>;
  /** @deprecated use CSS */
  width?: Attr<Numberish>;
}

/** `<td>` */
export interface TdAttributes extends TableCellAttributes {}

/** `<th>` */
export interface ThAttributes extends TableCellAttributes {}

/** `<template>` (declarative shadow DOM). */
export interface TemplateAttributes extends HTMLAttributes<HTMLTemplateElement> {
  shadowrootclonable?: Attr<boolean>;
  shadowrootdelegatesfocus?: Attr<boolean>;
  shadowrootmode?: Attr<'open' | 'closed'>;
  shadowrootserializable?: Attr<boolean>;
}

/** `<textarea>` */
export interface TextareaAttributes extends HTMLAttributes<HTMLTextAreaElement> {
  autocomplete?: Attr<AutoCompleteValue>;
  cols?: Attr<Numberish>;
  dirname?: Attr<string>;
  disabled?: Attr<boolean>;
  form?: Attr<string>;
  maxlength?: Attr<Numberish>;
  minlength?: Attr<Numberish>;
  name?: Attr<string>;
  placeholder?: Attr<string>;
  readonly?: Attr<boolean>;
  required?: Attr<boolean>;
  rows?: Attr<Numberish>;
  value?: Attr<string | number | readonly string[]>;
  wrap?: Attr<'hard' | 'soft' | 'off'>;

  // DOM properties
  defaultValue?: Attr<string | number>;
}

/** `<time>` */
export interface TimeAttributes extends HTMLAttributes<HTMLTimeElement> {
  datetime?: Attr<string>;
}

/** `<track>` */
export interface TrackAttributes extends HTMLAttributes<HTMLTrackElement> {
  default?: Attr<boolean>;
  kind?: Attr<'subtitles' | 'captions' | 'descriptions' | 'chapters' | 'metadata'>;
  label?: Attr<string>;
  src?: Attr<string>;
  srclang?: Attr<string>;
}

// ===========================================================================
// SVG attributes
// ===========================================================================

/** SVG attribute values: anything that stringifies sensibly. */
type SVGValue = Attr<string | number>;

/**
 * Attributes every SVG element accepts. Names are written as in markup:
 * camelCase where SVG itself uses camelCase (`viewBox`, `stdDeviation`),
 * kebab-case for presentation attributes (`stroke-width`, `text-anchor`).
 */
export interface SVGAttributes<T extends EventTarget = SVGElement>
  extends DOMAttributes<T>,
    AriaAttributes,
    DatasetAttributes {
  // Core and styling
  autofocus?: Attr<boolean>;
  class?: ClassValue;
  id?: Attr<string>;
  lang?: Attr<string>;
  nonce?: Attr<string>;
  role?: Attr<AriaRole>;
  style?: Attr<string | StyleObject>;
  tabindex?: Attr<Numberish>;
  'xml:base'?: SVGValue;
  'xml:lang'?: SVGValue;
  'xml:space'?: SVGValue;

  // Namespaces and document structure
  baseProfile?: SVGValue;
  version?: SVGValue;
  xmlns?: SVGValue;
  'xmlns:xlink'?: SVGValue;
  zoomAndPan?: SVGValue;

  // Links and references
  download?: SVGValue;
  href?: SVGValue;
  hreflang?: SVGValue;
  ping?: SVGValue;
  referrerpolicy?: Attr<HTMLAttributeReferrerPolicy>;
  rel?: SVGValue;
  target?: SVGValue;
  'xlink:actuate'?: SVGValue;
  'xlink:arcrole'?: SVGValue;
  'xlink:href'?: SVGValue;
  'xlink:role'?: SVGValue;
  'xlink:show'?: SVGValue;
  'xlink:title'?: SVGValue;
  'xlink:type'?: SVGValue;

  // Conditional processing
  requiredExtensions?: SVGValue;
  systemLanguage?: SVGValue;

  // Viewports and coordinate systems
  preserveAspectRatio?: SVGValue;
  transform?: SVGValue;
  'transform-origin'?: SVGValue;
  viewBox?: SVGValue;

  // Geometry
  cx?: SVGValue;
  cy?: SVGValue;
  d?: SVGValue;
  dx?: SVGValue;
  dy?: SVGValue;
  fr?: SVGValue;
  fx?: SVGValue;
  fy?: SVGValue;
  height?: SVGValue;
  pathLength?: SVGValue;
  points?: SVGValue;
  r?: SVGValue;
  rx?: SVGValue;
  ry?: SVGValue;
  width?: SVGValue;
  x?: SVGValue;
  x1?: SVGValue;
  x2?: SVGValue;
  y?: SVGValue;
  y1?: SVGValue;
  y2?: SVGValue;

  // Gradients, patterns, clipping, masking and markers
  clipPathUnits?: SVGValue;
  gradientTransform?: SVGValue;
  gradientUnits?: SVGValue;
  markerHeight?: SVGValue;
  markerUnits?: SVGValue;
  markerWidth?: SVGValue;
  maskContentUnits?: SVGValue;
  maskUnits?: SVGValue;
  offset?: SVGValue;
  orient?: SVGValue;
  patternContentUnits?: SVGValue;
  patternTransform?: SVGValue;
  patternUnits?: SVGValue;
  refX?: SVGValue;
  refY?: SVGValue;
  spreadMethod?: SVGValue;

  // Text
  lengthAdjust?: SVGValue;
  method?: SVGValue;
  path?: SVGValue;
  rotate?: SVGValue;
  side?: SVGValue;
  spacing?: SVGValue;
  startOffset?: SVGValue;
  textLength?: SVGValue;

  // Animation (SMIL)
  accumulate?: SVGValue;
  additive?: SVGValue;
  attributeName?: SVGValue;
  attributeType?: SVGValue;
  begin?: SVGValue;
  by?: SVGValue;
  calcMode?: SVGValue;
  dur?: SVGValue;
  end?: SVGValue;
  from?: SVGValue;
  keyPoints?: SVGValue;
  keySplines?: SVGValue;
  keyTimes?: SVGValue;
  max?: SVGValue;
  min?: SVGValue;
  origin?: SVGValue;
  repeatCount?: SVGValue;
  repeatDur?: SVGValue;
  restart?: SVGValue;
  to?: SVGValue;
  type?: SVGValue;
  values?: SVGValue;

  // Filter effects
  amplitude?: SVGValue;
  azimuth?: SVGValue;
  baseFrequency?: SVGValue;
  bias?: SVGValue;
  crossorigin?: Attr<CrossOrigin>;
  decoding?: SVGValue;
  diffuseConstant?: SVGValue;
  divisor?: SVGValue;
  edgeMode?: SVGValue;
  elevation?: SVGValue;
  exponent?: SVGValue;
  filterUnits?: SVGValue;
  in?: SVGValue;
  in2?: SVGValue;
  intercept?: SVGValue;
  k1?: SVGValue;
  k2?: SVGValue;
  k3?: SVGValue;
  k4?: SVGValue;
  kernelMatrix?: SVGValue;
  kernelUnitLength?: SVGValue;
  limitingConeAngle?: SVGValue;
  mode?: SVGValue;
  numOctaves?: SVGValue;
  operator?: SVGValue;
  order?: SVGValue;
  pointsAtX?: SVGValue;
  pointsAtY?: SVGValue;
  pointsAtZ?: SVGValue;
  preserveAlpha?: SVGValue;
  primitiveUnits?: SVGValue;
  radius?: SVGValue;
  result?: SVGValue;
  scale?: SVGValue;
  seed?: SVGValue;
  slope?: SVGValue;
  specularConstant?: SVGValue;
  specularExponent?: SVGValue;
  stdDeviation?: SVGValue;
  stitchTiles?: SVGValue;
  surfaceScale?: SVGValue;
  tableValues?: SVGValue;
  targetX?: SVGValue;
  targetY?: SVGValue;
  xChannelSelector?: SVGValue;
  yChannelSelector?: SVGValue;
  z?: SVGValue;

  // Presentation attributes (https://www.w3.org/TR/SVG2/styling.html#PresentationAttributes)
  'alignment-baseline'?: SVGValue;
  'baseline-shift'?: SVGValue;
  clip?: SVGValue;
  'clip-path'?: SVGValue;
  'clip-rule'?: SVGValue;
  color?: SVGValue;
  'color-interpolation'?: SVGValue;
  'color-interpolation-filters'?: SVGValue;
  'color-rendering'?: SVGValue;
  cursor?: SVGValue;
  direction?: SVGValue;
  display?: SVGValue;
  'dominant-baseline'?: SVGValue;
  fill?: SVGValue;
  'fill-opacity'?: SVGValue;
  'fill-rule'?: SVGValue;
  filter?: SVGValue;
  'flood-color'?: SVGValue;
  'flood-opacity'?: SVGValue;
  'font-family'?: SVGValue;
  'font-size'?: SVGValue;
  'font-size-adjust'?: SVGValue;
  'font-stretch'?: SVGValue;
  'font-style'?: SVGValue;
  'font-variant'?: SVGValue;
  'font-weight'?: SVGValue;
  'glyph-orientation-horizontal'?: SVGValue;
  'glyph-orientation-vertical'?: SVGValue;
  'image-rendering'?: SVGValue;
  'letter-spacing'?: SVGValue;
  'lighting-color'?: SVGValue;
  'marker-end'?: SVGValue;
  'marker-mid'?: SVGValue;
  'marker-start'?: SVGValue;
  mask?: SVGValue;
  'mask-type'?: SVGValue;
  opacity?: SVGValue;
  overflow?: SVGValue;
  'paint-order'?: SVGValue;
  'pointer-events'?: SVGValue;
  'shape-rendering'?: SVGValue;
  'stop-color'?: SVGValue;
  'stop-opacity'?: SVGValue;
  stroke?: SVGValue;
  'stroke-dasharray'?: SVGValue;
  'stroke-dashoffset'?: SVGValue;
  'stroke-linecap'?: SVGValue;
  'stroke-linejoin'?: SVGValue;
  'stroke-miterlimit'?: SVGValue;
  'stroke-opacity'?: SVGValue;
  'stroke-width'?: SVGValue;
  'text-anchor'?: SVGValue;
  'text-decoration'?: SVGValue;
  'text-overflow'?: SVGValue;
  'text-rendering'?: SVGValue;
  'unicode-bidi'?: SVGValue;
  'vector-effect'?: SVGValue;
  visibility?: SVGValue;
  'white-space'?: SVGValue;
  'word-spacing'?: SVGValue;
  'writing-mode'?: SVGValue;

  // Non-standard but widespread
  /** Legacy keyboard focus control, still emitted by icon sets (`focusable="false"`). */
  focusable?: SVGValue;

  // DOM properties set directly on the element
  innerHTML?: Attr<string>;
  textContent?: Attr<string | number>;
}

// ===========================================================================
// MathML attributes
// ===========================================================================

/** MathML elements: global attributes plus any MathML attribute. */
export type MathMLAttributes = HTMLAttributes<MathMLElement> & { [attr: string]: unknown };

// ===========================================================================
// Tag name to attributes
// ===========================================================================

/**
 * Every element tag OWT markup knows, mapped to the attributes it accepts.
 * Tags present in both HTML and SVG (`a`, `script`, `style`, `title`) use
 * their HTML attributes.
 */
export interface OwtElements {
  // HTML: document metadata
  base: BaseAttributes;
  head: HTMLAttributes<HTMLHeadElement>;
  html: HTMLAttributes<HTMLHtmlElement>;
  link: LinkAttributes;
  meta: MetaAttributes;
  style: StyleAttributes;
  title: HTMLAttributes<HTMLTitleElement>;

  // HTML: sections
  address: HTMLAttributes;
  article: HTMLAttributes;
  aside: HTMLAttributes;
  body: HTMLAttributes<HTMLBodyElement>;
  footer: HTMLAttributes;
  h1: HTMLAttributes<HTMLHeadingElement>;
  h2: HTMLAttributes<HTMLHeadingElement>;
  h3: HTMLAttributes<HTMLHeadingElement>;
  h4: HTMLAttributes<HTMLHeadingElement>;
  h5: HTMLAttributes<HTMLHeadingElement>;
  h6: HTMLAttributes<HTMLHeadingElement>;
  header: HTMLAttributes;
  hgroup: HTMLAttributes;
  main: HTMLAttributes;
  nav: HTMLAttributes;
  search: HTMLAttributes;
  section: HTMLAttributes;

  // HTML: grouping content
  blockquote: BlockquoteAttributes;
  dd: HTMLAttributes;
  div: HTMLAttributes<HTMLDivElement>;
  dl: HTMLAttributes<HTMLDListElement>;
  dt: HTMLAttributes;
  figcaption: HTMLAttributes;
  figure: HTMLAttributes;
  hr: HTMLAttributes<HTMLHRElement>;
  li: LiAttributes;
  menu: HTMLAttributes<HTMLMenuElement>;
  ol: OlAttributes;
  p: HTMLAttributes<HTMLParagraphElement>;
  pre: HTMLAttributes<HTMLPreElement>;
  ul: HTMLAttributes<HTMLUListElement>;

  // HTML: text-level semantics
  a: AnchorAttributes;
  abbr: HTMLAttributes;
  b: HTMLAttributes;
  bdi: HTMLAttributes;
  bdo: HTMLAttributes;
  br: HTMLAttributes<HTMLBRElement>;
  cite: HTMLAttributes;
  code: HTMLAttributes;
  data: DataAttributes;
  dfn: HTMLAttributes;
  em: HTMLAttributes;
  i: HTMLAttributes;
  kbd: HTMLAttributes;
  mark: HTMLAttributes;
  q: QuoteAttributes;
  rp: HTMLAttributes;
  rt: HTMLAttributes;
  ruby: HTMLAttributes;
  s: HTMLAttributes;
  samp: HTMLAttributes;
  small: HTMLAttributes;
  span: HTMLAttributes<HTMLSpanElement>;
  strong: HTMLAttributes;
  sub: HTMLAttributes;
  sup: HTMLAttributes;
  time: TimeAttributes;
  u: HTMLAttributes;
  var: HTMLAttributes;
  wbr: HTMLAttributes;

  // HTML: edits
  del: ModAttributes;
  ins: ModAttributes;

  // HTML: embedded content
  area: AreaAttributes;
  audio: AudioAttributes;
  canvas: CanvasAttributes;
  embed: EmbedAttributes;
  iframe: IframeAttributes;
  img: ImgAttributes;
  map: MapAttributes;
  object: ObjectAttributes;
  picture: HTMLAttributes<HTMLPictureElement>;
  source: SourceAttributes;
  track: TrackAttributes;
  video: VideoAttributes;

  // HTML: tables
  caption: HTMLAttributes<HTMLTableCaptionElement>;
  col: ColAttributes;
  colgroup: ColAttributes;
  table: TableAttributes;
  tbody: HTMLAttributes<HTMLTableSectionElement>;
  td: TdAttributes;
  tfoot: HTMLAttributes<HTMLTableSectionElement>;
  th: ThAttributes;
  thead: HTMLAttributes<HTMLTableSectionElement>;
  tr: HTMLAttributes<HTMLTableRowElement>;

  // HTML: forms
  button: ButtonAttributes;
  datalist: HTMLAttributes<HTMLDataListElement>;
  fieldset: FieldsetAttributes;
  form: FormAttributes;
  input: InputAttributes;
  label: LabelAttributes;
  legend: HTMLAttributes<HTMLLegendElement>;
  meter: MeterAttributes;
  optgroup: OptgroupAttributes;
  option: OptionAttributes;
  output: OutputAttributes;
  progress: ProgressAttributes;
  select: SelectAttributes;
  textarea: TextareaAttributes;

  // HTML: interactive elements
  details: DetailsAttributes;
  dialog: DialogAttributes;
  summary: HTMLAttributes;

  // HTML: scripting and web components
  noscript: HTMLAttributes;
  script: ScriptAttributes;
  slot: SlotAttributes;
  template: TemplateAttributes;

  // SVG: structure and containers
  defs: SVGAttributes<SVGDefsElement>;
  desc: SVGAttributes<SVGDescElement>;
  foreignObject: SVGAttributes<SVGForeignObjectElement>;
  g: SVGAttributes<SVGGElement>;
  metadata: SVGAttributes<SVGMetadataElement>;
  svg: SVGAttributes<SVGSVGElement>;
  switch: SVGAttributes<SVGSwitchElement>;
  symbol: SVGAttributes<SVGSymbolElement>;
  use: SVGAttributes<SVGUseElement>;
  view: SVGAttributes<SVGViewElement>;

  // SVG: shapes
  circle: SVGAttributes<SVGCircleElement>;
  ellipse: SVGAttributes<SVGEllipseElement>;
  line: SVGAttributes<SVGLineElement>;
  path: SVGAttributes<SVGPathElement>;
  polygon: SVGAttributes<SVGPolygonElement>;
  polyline: SVGAttributes<SVGPolylineElement>;
  rect: SVGAttributes<SVGRectElement>;

  // SVG: text
  text: SVGAttributes<SVGTextElement>;
  textPath: SVGAttributes<SVGTextPathElement>;
  tspan: SVGAttributes<SVGTSpanElement>;

  // SVG: images
  image: SVGAttributes<SVGImageElement>;

  // SVG: paint servers, clipping, masking, markers
  clipPath: SVGAttributes<SVGClipPathElement>;
  linearGradient: SVGAttributes<SVGLinearGradientElement>;
  marker: SVGAttributes<SVGMarkerElement>;
  mask: SVGAttributes<SVGMaskElement>;
  pattern: SVGAttributes<SVGPatternElement>;
  radialGradient: SVGAttributes<SVGRadialGradientElement>;
  stop: SVGAttributes<SVGStopElement>;

  // SVG: animation
  animate: SVGAttributes<SVGAnimateElement>;
  animateMotion: SVGAttributes<SVGAnimateMotionElement>;
  animateTransform: SVGAttributes<SVGAnimateTransformElement>;
  mpath: SVGAttributes<SVGMPathElement>;
  set: SVGAttributes<SVGSetElement>;

  // SVG: filter effects
  feBlend: SVGAttributes<SVGFEBlendElement>;
  feColorMatrix: SVGAttributes<SVGFEColorMatrixElement>;
  feComponentTransfer: SVGAttributes<SVGFEComponentTransferElement>;
  feComposite: SVGAttributes<SVGFECompositeElement>;
  feConvolveMatrix: SVGAttributes<SVGFEConvolveMatrixElement>;
  feDiffuseLighting: SVGAttributes<SVGFEDiffuseLightingElement>;
  feDisplacementMap: SVGAttributes<SVGFEDisplacementMapElement>;
  feDistantLight: SVGAttributes<SVGFEDistantLightElement>;
  feDropShadow: SVGAttributes<SVGFEDropShadowElement>;
  feFlood: SVGAttributes<SVGFEFloodElement>;
  feFuncA: SVGAttributes<SVGFEFuncAElement>;
  feFuncB: SVGAttributes<SVGFEFuncBElement>;
  feFuncG: SVGAttributes<SVGFEFuncGElement>;
  feFuncR: SVGAttributes<SVGFEFuncRElement>;
  feGaussianBlur: SVGAttributes<SVGFEGaussianBlurElement>;
  feImage: SVGAttributes<SVGFEImageElement>;
  feMerge: SVGAttributes<SVGFEMergeElement>;
  feMergeNode: SVGAttributes<SVGFEMergeNodeElement>;
  feMorphology: SVGAttributes<SVGFEMorphologyElement>;
  feOffset: SVGAttributes<SVGFEOffsetElement>;
  fePointLight: SVGAttributes<SVGFEPointLightElement>;
  feSpecularLighting: SVGAttributes<SVGFESpecularLightingElement>;
  feSpotLight: SVGAttributes<SVGFESpotLightElement>;
  feTile: SVGAttributes<SVGFETileElement>;
  feTurbulence: SVGAttributes<SVGFETurbulenceElement>;
  filter: SVGAttributes<SVGFilterElement>;

  // MathML
  math: MathMLAttributes;
  annotation: MathMLAttributes;
  'annotation-xml': MathMLAttributes;
  maction: MathMLAttributes;
  merror: MathMLAttributes;
  mfrac: MathMLAttributes;
  mi: MathMLAttributes;
  mmultiscripts: MathMLAttributes;
  mn: MathMLAttributes;
  mo: MathMLAttributes;
  mover: MathMLAttributes;
  mpadded: MathMLAttributes;
  mphantom: MathMLAttributes;
  mprescripts: MathMLAttributes;
  mroot: MathMLAttributes;
  mrow: MathMLAttributes;
  ms: MathMLAttributes;
  mspace: MathMLAttributes;
  msqrt: MathMLAttributes;
  mstyle: MathMLAttributes;
  msub: MathMLAttributes;
  msubsup: MathMLAttributes;
  msup: MathMLAttributes;
  mtable: MathMLAttributes;
  mtd: MathMLAttributes;
  mtext: MathMLAttributes;
  mtr: MathMLAttributes;
  munder: MathMLAttributes;
  munderover: MathMLAttributes;
  semantics: MathMLAttributes;
}

/** The DOM element type created for a tag (HTML wins over SVG for shared tags). */
export type OwtElementInstance<K extends string> = K extends keyof HTMLElementTagNameMap
  ? HTMLElementTagNameMap[K]
  : K extends keyof SVGElementTagNameMap
    ? SVGElementTagNameMap[K]
    : K extends keyof MathMLElementTagNameMap
      ? MathMLElementTagNameMap[K]
      : Element;
