// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { flushSync } from 'owt';
import { compile } from '../src/index';
import { render, text } from './helpers';

const key = (el: Element, init: KeyboardEventInit) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  flushSync();
};

describe('event modifiers', () => {
  it('prevents the default action without a handler', async () => {
    const m = await render(`export component App() {\n  <form onSubmit|preventDefault><button>go</button></form>\n}`);
    const event = new Event('submit', { cancelable: true, bubbles: true });

    m.root.querySelector('form')!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('stops propagation before calling the handler', async () => {
    const m = await render(`export component App() {\n  var log: string[] = []\n  <div onClick={() => log.push('outer')}>\n    <button onClick|stopPropagation={() => log.push('inner')}>x</button>\n  </div>\n  <p>{log.join(',')}</p>\n}`);

    m.click('button');

    expect(text(m, 'p')).toBe('inner');
  });

  it('runs once handlers a single time', async () => {
    const m = await render(`export component App() {\n  var n = 0\n  <button onClick|once={() => n++}>{n}</button>\n}`);

    m.click('button');
    m.click('button');

    expect(text(m, 'button')).toBe('1');
  });

  it('filters keys and system modifiers', async () => {
    const m = await render(`export component App() {\n  var log: string[] = []\n  <input onKeyDown|enter={() => log.push('enter')} onKeyUp|ctrl|s={() => log.push('save')} />\n  <p>{log.join(',')}</p>\n}`);
    const input = m.root.querySelector('input')!;

    key(input, { key: 'a' });
    key(input, { key: 'Enter' });
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 's', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'S', ctrlKey: true, bubbles: true }));
    flushSync();

    expect(text(m, 'p')).toBe('enter,save');
  });

  it('requires exact system modifiers with |exact', async () => {
    const m = await render(`export component App() {\n  var n = 0\n  <input onKeyDown|ctrl|exact|enter={() => n++} />\n  <p>{n}</p>\n}`);
    const input = m.root.querySelector('input')!;

    key(input, { key: 'Enter', ctrlKey: true, shiftKey: true });
    key(input, { key: 'Enter', ctrlKey: true });

    expect(text(m, 'p')).toBe('1');
  });

  it('runs several handlers for the same event with different modifiers', async () => {
    const m = await render(`export component App() {\n  var log: string[] = []\n  <input onKeyDown|enter={() => log.push('enter')} onKeyDown|escape={() => log.push('escape')} onKeyDown={() => log.push('any')} />\n  <p>{log.join(',')}</p>\n}`);
    const input = m.root.querySelector('input')!;

    key(input, { key: 'Enter' });
    key(input, { key: 'Escape' });

    expect(text(m, 'p')).toBe('enter,any,escape,any');
  });

  it('ignores events from children with |self', async () => {
    const m = await render(`export component App() {\n  var n = 0\n  <div id="box" onClick|self={() => n++}><span>child</span></div>\n  <p>{n}</p>\n}`);

    m.click('span');
    m.click('#box');

    expect(text(m, 'p')).toBe('1');
  });

  it('applies modifiers to window events', async () => {
    const m = await render(`export component App() {\n  var open = true\n  <window onKeyDown|escape={open = false} />\n  <p>{open ? 'open' : 'closed'}</p>\n}`);

    key(document.body, { key: 'x' });
    const before = text(m, 'p');
    key(document.body, { key: 'Escape' });

    expect(before).toBe('open');
    expect(text(m, 'p')).toBe('closed');
  });

  it('applies modifiers to custom events', async () => {
    const m = await render(`export component App() {\n  var n = 0\n  <div on:ping|once={() => n++}></div>\n  <p>{n}</p>\n}`);
    const div = m.root.querySelector('div')!;

    div.dispatchEvent(new CustomEvent('ping'));
    div.dispatchEvent(new CustomEvent('ping'));
    flushSync();

    expect(text(m, 'p')).toBe('1');
  });

  it('rejects unknown modifiers', () => {
    expect(() => compile(`export component App() {\n  <button onClick|prevent={() => {}}>x</button>\n}`, { filename: 'App.owt' })).toThrow(/Unknown event modifier \|prevent/);
  });

  it('rejects key modifiers on mouse events', () => {
    expect(() => compile(`export component App() {\n  <button onClick|enter={() => {}}>x</button>\n}`, { filename: 'App.owt' })).toThrow(/is a key/);
  });

  it('rejects passive listeners that prevent the default action', () => {
    expect(() => compile(`export component App() {\n  <div onWheel|passive|preventDefault={() => {}}></div>\n}`, { filename: 'App.owt' })).toThrow(/passive/);
  });

  it('attaches passive listeners directly', () => {
    const out = compile(`export component App() {\n  <div onTouchStart|passive={() => {}}></div>\n}`, { filename: 'App.owt' });

    expect(out.js.code).toContain('{ passive: true }');
  });
});
