const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('desktop bridge exposes safe clinical file selection and opening', () => {
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert.ok(preload.includes('selecionarArquivoClinico'));
  assert.ok(preload.includes('abrirArquivoClinico'));
  assert.ok(main.includes("ipcMain.handle('selecionar-arquivo-clinico'"));
  assert.ok(main.includes("ipcMain.handle('abrir-arquivo-clinico'"));
});
