const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fiscalMainPath = path.join(__dirname, '..', 'js/modules/fiscal/fiscal-main.js');
const preloadPath = path.join(__dirname, '..', 'preload.js');
const desktopMainPath = path.join(__dirname, '..', 'updater-main.js');

const fiscalMainExists = fs.existsSync(fiscalMainPath);

test('fiscal main module exists', () => {
  assert.ok(fiscalMainExists, 'fiscal-main.js must exist');
});

if (fiscalMainExists) {
  const source = fs.readFileSync(fiscalMainPath, 'utf8');
  const preload = fs.readFileSync(preloadPath, 'utf8');
  const desktopMain = fs.readFileSync(desktopMainPath, 'utf8');

  test('fiscal credentials are protected by Electron safeStorage and dedicated encrypted file', () => {
    assert.match(source, /safeStorage/);
    assert.match(source, /fiscal-connection\.enc/);
    assert.match(source, /encryptString/);
    assert.match(source, /decryptString/);
    assert.doesNotMatch(preload, /getToken|readToken|token:\s*\(\)/i);
  });

  test('preload exposes only restricted fiscal operations', () => {
    assert.match(preload, /fiscal:\s*\{/);
    for (const method of ['status', 'saveConnection', 'removeConnection', 'testConnection', 'emit', 'query', 'cancel']) {
      assert.match(preload, new RegExp(`${method}:`));
    }
  });

  test('fiscal IPC is registered by desktop main process', () => {
    assert.match(desktopMain, /registerFiscalIpc/);
    assert.match(source, /fiscal:status/);
    assert.match(source, /fiscal:save-connection/);
    assert.match(source, /fiscal:emit/);
  });

  test('fiscal main bounds renderer payload size and whitelists document types', () => {
    assert.match(source, /MAX_FISCAL_PAYLOAD_BYTES/);
    assert.match(source, /nfse/);
    assert.match(source, /nfsen/);
    assert.doesNotMatch(source, /https?:\/\/\$\{|new URL\([^)]*input/i);
  });
}
