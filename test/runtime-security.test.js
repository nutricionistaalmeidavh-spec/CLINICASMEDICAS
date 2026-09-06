const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = require(path.join('..', 'package.json'));
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');

function numericVersion(value) {
  return String(value || '').replace(/^[^0-9]*/, '');
}

test('runtime security baseline uses supported Electron and electron-builder versions', () => {
  assert.equal(numericVersion(pkg.devDependencies.electron), '44.2.0');
  assert.equal(numericVersion(pkg.devDependencies['electron-builder']), '26.15.3');
});

test('renderer runs isolated with sandbox and without Node integration', () => {
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.doesNotMatch(main, /sandbox:\s*false/);
});

test('desktop blocks uncontrolled navigation, popups and permission requests', () => {
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /will-navigate/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /action:\s*'deny'/);
});

test('preload exposes narrow backup calls without filesystem primitives', () => {
  assert.match(preload, /salvarBackup:\s*\(data, password\)/);
  assert.match(preload, /abrirBackup:\s*\(password\)/);
  assert.doesNotMatch(preload, /require\(['"]fs['"]\)/);
  assert.doesNotMatch(preload, /require\(['"]path['"]\)/);
});

test('Windows packaging is x64-only', () => {
  assert.equal(pkg.scripts['build:win32'], undefined);
  assert.deepEqual(pkg.build.win.target, [{ target: 'nsis', arch: ['x64'] }]);
});

test('CI packaging never attempts to publish a release implicitly', () => {
  assert.match(pkg.scripts.build, /--publish\s+never/);
});
