// End-to-end checks: build every example with Vite and drive it in Chromium.
// Usage: node scripts/e2e.mjs [--no-build] [example...]
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { serve } from './serve.mjs';
import { launch } from './browser.mjs';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const build = !args.includes('--no-build');
const only = args.filter((a) => !a.startsWith('--'));

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const scenarios = {
  async basic(page) {
    assert((await page.textContent('h1')) === 'Hello OWT', 'title rendered from props');
    assert((await page.locator('ul').first().locator('li').count()) === 5, '5 list items initially');
    await page.click('text=Increment');
    assert((await page.textContent('body')).includes('Count: 6'), 'count incremented');
    assert((await page.locator('ul').first().locator('li').count()) === 6, 'list follows count');
    const reversed = await page.locator('ul').nth(1).locator('li').first().textContent();
    assert(reversed.trim() === 'Item 6', `reverse list starts at 6 (got ${reversed})`);
    await page.click('text=Increment by 2');
    assert((await page.textContent('body')).includes('Count: 8'), 'conditional button works');
    for (let i = 0; i < 8; i++) await page.click('text=Decrement');
    assert((await page.textContent('body')).includes('No items'), 'empty state shown');
  },
  async 'todo-app'(page) {
    const items = page.locator('.space-y-2 > div');
    const initial = await items.count();
    assert(initial === 3, `3 todos initially (got ${initial})`);
    await page.fill('input[type=text]', 'Write e2e tests');
    await page.press('input[type=text]', 'Enter');
    assert((await items.count()) === 4, 'todo added with Enter');
    assert((await page.inputValue('input[type=text]')) === '', 'input cleared after add');
    await items.nth(0).locator('input[type=checkbox]').check();
    assert((await page.textContent('body')).includes('2 completed'), 'toggle updates completed count');
    await page.click('text=Clear Completed');
    assert((await items.count()) === 2, 'clear completed removes done todos');
    const label = (i) => items.nth(i).locator('span.flex-1').textContent();
    const firstText = await label(0);
    await items.nth(1).locator('button[title="Move up"]').click();
    assert((await label(1)) === firstText, 'move up reorders');
    assert((await items.nth(1).locator('span').first().textContent()) === '2.', 'row index follows the move');
    await items.nth(0).locator('button[title="Delete"]').click();
    assert((await items.count()) === 1, 'delete removes a todo');
  },
  async showcase(page) {
    const text = (sel) => page.locator(sel).first().textContent();
    // two-way bound counter + derived values + switch + range loop
    await page.locator('.counter').first().locator('button').nth(1).click();
    assert((await text('#count')) === 'count = 4, doubled = 8', `counter binding (got ${await text('#count')})`);
    assert((await page.locator('.dot').count()) === 4, 'range loop follows count');
    // input binding updates the heading and the document title (head)
    await page.fill('#name', 'OWT');
    assert((await text('h1')) === 'Hello, OWT!', 'name binding');
    assert((await page.title()).startsWith('Hello OWT'), `head <title> binding (got ${await page.title()})`);
    // keyed list with generic component + named slots + shared store
    await page.click('#add-fruit');
    assert((await page.locator('.list li').count()) === 4, 'fruit added');
    assert((await text('#notifications')) === '1', 'store update rendered');
    await page.locator('.list .remove').first().click();
    assert((await page.locator('.list li').count()) === 3, 'fruit removed');
    // async data
    await page.waitForSelector('.user strong');
    assert((await text('.user strong')) === 'User #1', 'await then branch');
    // error boundary with reset
    await page.check('#explode');
    await page.waitForSelector('text=Caught: Kaboom');
    await page.click('text=Recover');
    assert((await page.locator('text=Everything is fine').count()) === 1, 'boundary reset');
    // forms: radio + checkbox groups
    await page.check('input[value=chocolate]');
    await page.check('input[value=nuts]');
    assert((await text('#order')) === 'One chocolate ice cream with sprinkles and nuts.', `bind:group (got ${await text('#order')})`);
    // portal + context + window events
    await page.click('#open-modal');
    assert((await page.locator('body > .backdrop').count()) === 1, 'modal rendered in body (portal)');
    assert((await text('.modal strong')) === 'Ada', 'context read inside portal');
    await page.keyboard.press('Escape');
    assert((await page.locator('.backdrop').count()) === 0, 'window keydown closes modal');
  },
};

const examples = only.length > 0 ? only : Object.keys(scenarios);
const browser = await launch();
let failed = 0;
for (const name of examples) {
  const dir = resolve(root, 'examples', name);
  try {
    if (build) execFileSync('npx', ['vite', 'build', '--logLevel', 'warn'], { cwd: dir, stdio: 'inherit' });
    const server = await serve(resolve(dir, 'dist'));
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(server.url);
    await page.waitForLoadState('networkidle');
    await scenarios[name](page);
    assert(errors.length === 0, `console errors: ${errors.join('\n')}`);
    await page.close();
    await server.close();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}: ${err.message}`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
