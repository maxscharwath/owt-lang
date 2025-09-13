const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function log(...args) { console.log('[copy-typescript]', ...args); }

function copyDir(src, dst) {
  if (fs.cp) {
    fs.rmSync(dst, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(src, dst, { recursive: true });
    return;
  }
  // Fallback to shell cp
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  cp.execFileSync('cp', ['-R', src, dst], { stdio: 'inherit' });
}

function main() {
  // Resolve typescript module path from current workspace (pnpm symlink allowed)
  let pkgPath;
  try {
    pkgPath = require.resolve('typescript/package.json', { paths: [process.cwd()] });
  } catch (e) {
    console.error('Could not resolve typescript/package.json from', process.cwd(), ':', e.message);
    process.exit(1);
  }
  const srcDir = path.dirname(pkgPath);
  const dstDir = path.join(process.cwd(), 'vendor', 'typescript');
  log('copying', srcDir, '->', dstDir);
  copyDir(srcDir, dstDir);
  // Sanity check
  const tsjs = path.join(dstDir, 'lib', 'typescript.js');
  if (!fs.existsSync(tsjs)) {
    console.error('Failed to copy typescript lib/typescript.js');
    process.exit(2);
  }
  log('done');
}

main();
