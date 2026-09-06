const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

test('desktop bridge exposes automatic migration backup without generic filesystem access', () => {
  assert.match(main, /criar-backup-pre-migracao/);
  assert.match(preload, /criarBackupPreMigracao/);
  assert.match(main, /createSafetySnapshot\('pre-migration'/);
  assert.match(main, /backupDirectory/);
  assert.match(main, /fs\.copyFileSync/);
  assert.doesNotMatch(preload, /require\(['"]fs['"]\)/);
});

test('import bridge only selects supported patient import files', () => {
  assert.match(main, /selecionar-arquivo-importacao/);
  assert.match(preload, /selecionarArquivoImportacao/);
  assert.match(main, /csv/);
  assert.match(main, /xlsx/);
});

test('document image bridge is restricted to image extensions and bounded reads', () => {
  assert.match(main, /ler-imagem-clinica-para-documento/);
  assert.match(preload, /lerImagemClinicaParaDocumento/);
  assert.match(main, /8\s*\*\s*1024\s*\*\s*1024/);
});
