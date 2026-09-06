const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

test('declara electron-updater como dependencia de runtime', () => {
  const pkg = readJson('package.json');
  assert.equal(pkg.dependencies?.['electron-updater'], '^6.6.2');
});
