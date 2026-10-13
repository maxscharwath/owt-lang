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
    if (!(await page.locator('#showcase').count())) return;
  },
};

const examples = only.length > 0 ? only : Object.keys(scenarios).filter((name) => name !== 'showcase');
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
