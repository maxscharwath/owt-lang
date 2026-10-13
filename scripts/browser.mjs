// Launch Chromium through Playwright, preferring the pre-installed browser when the bundled revision is missing.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter(Boolean);

export async function launch() {
  try {
    return await chromium.launch();
  } catch (err) {
    const executablePath = CANDIDATES.find((p) => existsSync(p));
    if (!executablePath) throw err;
    return chromium.launch({ executablePath });
  }
}
