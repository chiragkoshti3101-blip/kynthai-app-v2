// Run on every production build (package.json "prebuild").
// Keeps CSS filename, service worker, and PWA manifest version in sync so
// phones drop stale caches as soon as a new deploy goes live.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || gitSha() || 'local';
const deployId = `${sha}-${Date.now().toString(36)}`;

// 1) CSS variable → new content hash → new stylesheet filename
const cssPath = path.join(__dirname, '..', 'src', 'app', 'globals.css');
if (fs.existsSync(cssPath)) {
  let css = fs.readFileSync(cssPath, 'utf8');
  if (/--deploy-hash:\s*[^;]+;/.test(css)) {
    css = css.replace(/--deploy-hash:\s*[^;]+;/, `--deploy-hash: ${deployId};`);
  } else {
    css = `/* deploy:${deployId} */\n` + css;
  }
  // Keep a human-readable marker line too
  css = css.replace(
    /\/\* deploy-\d+ts:\d+ — forces new CSS hash on every deploy \*\//,
    `/* deploy-${Date.now()}ts:${Math.floor(Date.now() / 1000)} — forces new CSS hash on every deploy */`,
  );
  fs.writeFileSync(cssPath, css);
  console.log('[cache-bust] globals.css deploy-hash →', deployId);
}

// 2) Service worker DEPLOY_ID (invalidates all SW caches)
const swPath = path.join(__dirname, '..', 'public', 'sw.js');
if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw.replace(
    /const DEPLOY_ID = ['"][^'"]*['"]/,
    `const DEPLOY_ID = '${deployId}'`,
  );
  fs.writeFileSync(swPath, sw);
  console.log('[cache-bust] public/sw.js DEPLOY_ID →', deployId);
}

// 3) Dynamic manifest route version (PWA clients compare this)
const manifestRoute = path.join(
  __dirname,
  '..',
  'src',
  'app',
  'manifest.json',
  'route.ts',
);
if (fs.existsSync(manifestRoute)) {
  let route = fs.readFileSync(manifestRoute, 'utf8');
  route = route.replace(
    /version:\s*['"][^'"]*['"]/,
    `version: '${deployId}'`,
  );
  fs.writeFileSync(manifestRoute, route);
  console.log('[cache-bust] manifest version →', deployId);
}

// 4) Static public/manifest.json if present
const publicManifest = path.join(__dirname, '..', 'public', 'manifest.json');
if (fs.existsSync(publicManifest)) {
  try {
    const m = JSON.parse(fs.readFileSync(publicManifest, 'utf8'));
    m.version = deployId;
    fs.writeFileSync(publicManifest, JSON.stringify(m, null, 2) + '\n');
    console.log('[cache-bust] public/manifest.json version →', deployId);
  } catch (e) {
    console.warn('[cache-bust] public/manifest.json skip', e.message);
  }
}

console.log('[cache-bust] done', deployId);
