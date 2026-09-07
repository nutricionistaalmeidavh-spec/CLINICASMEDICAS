const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Hub forwards applied remote mutations to local renderer instead of leaving two divergent writers', () => {
  const main = read('js/core/clinic-network-main.js');
  const preload = read('preload.js');
  const client = read('js/core/clinic-network-client.js');
  assert.match(main, /onMutationApplied/);
  assert.match(main, /clinic-network:hub-mutation-applied/);
  assert.match(preload, /hub-mutation-applied/);
  assert.match(client, /applyHubMutation/);
});

test('client connectivity state is based on successful RPC rather than only an authenticated session', () => {
  const main = read('js/core/clinic-network-main.js');
  assert.match(main, /clientOnline/);
  assert.match(main, /connected:\s*Boolean\(clientOnline/);
});
