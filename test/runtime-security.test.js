const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const pkg = require(path.join('..', 'package.json'));

function numericVersion(value) {
  return String(value || '').replace(/^[^0-9]*/, '');
}

test('runtime security baseline uses supported Electron and electron-builder versions', () => {
  assert.equal(numericVersion(pkg.devDependencies.electron), '44.2.0');
  assert.equal(numericVersion(pkg.devDependencies['electron-builder']), '26.15.3');
});

test('Windows packaging is x64-only', () => {
  assert.equal(pkg.scripts['build:win32'], undefined);
  assert.deepEqual(pkg.build.win.target, [{ target: 'nsis', arch: ['x64'] }]);
});
