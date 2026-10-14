// Actions: reusable element behaviour, attached with `use:tooltip={text}`.
export function tooltip(el: HTMLElement, text: string) {
  el.title = text;
  el.dataset.tooltip = text;
  return {
    update(next: string) {
      el.title = next;
      el.dataset.tooltip = next;
    },
  };
}

export function autofocus(el: HTMLElement) {
  queueMicrotask(() => el.focus());
}
