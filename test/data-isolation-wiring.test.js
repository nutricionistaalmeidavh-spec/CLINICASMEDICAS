const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('desktop entry installs isolation before the application becomes usable', () => {
  const source = read('updater-main.js');
  assert.match(source, /installLocalDataIsolation/);
  assert.match(source, /installLocalDataIsolation\(\{ app, ipcMain, safeStorage, dialog, shell \}\)/);
});

test('preload exposes only session-bound professional database and clinical-file operations', () => {
  const source = read('preload.js');
  for (const channel of [
    'data-isolation:load-clinic',
    'data-isolation:save-clinic',
    'data-isolation:authenticate',
    'data-isolation:load-professional',
    'data-isolation:save-professional',
    'data-isolation:select-clinical-file',
    'data-isolation:open-clinical-file',
    'data-isolation:adopt-legacy-clinical-file',
    'data-isolation:remove-clinical-file',
    'data-isolation:read-clinical-image',
    'data-isolation:end-session'
  ]) {
    assert.match(source, new RegExp(channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(source, /professionalId\).*data-isolation:load-professional/);
  assert.match(source, /selectClinicalFile: \(sessionToken\)/);
  assert.match(source, /openClinicalFile: \(sessionToken, filePath\)/);
  assert.match(source, /readClinicalImage: \(sessionToken, filePath\)/);
});

test('clinical image document rendering passes the authenticated professional session', () => {
  const source = read('js/domains/platform-documents.js');
  assert.match(source, /DB\?\.session\?\.\(\)\?\.token/);
  assert.match(source, /readClinicalImage\(token, row\.caminho_arquivo\)/);
  assert.doesNotMatch(source, /lerImagemClinicaParaDocumento\(row\.caminho_arquivo\)/);
});

test('renderer installs backup-safe database routing before migrations and domain modules', () => {
  const source = read('js/core/navigation.js');
  const model = source.indexOf("'js/core/data-isolation.js'");
  const router = source.indexOf("'js/core/database-isolation-router-safe.js'");
  const migrations = source.indexOf("'js/core/migrations.js'");
  const settings = source.indexOf("'js/domains/settings.js'");
  const professionalLink = source.indexOf("'js/domains/professional-user-link.js'");

  assert.ok(model >= 0);
  assert.ok(router > model);
  assert.ok(migrations > router);
  assert.ok(professionalLink > settings);
});

test('clinical writes preserve the current backup contract while reads remain professional-only', () => {
  const source = read('js/core/database-isolation-router-safe.js');
  assert.match(source, /return querySqlJs\(professionalDb, sql, params\)/);
  assert.match(source, /const result = clinicStore\.run\(sql, params\);[\s\S]*replaceProfessionalFromClinic\(\)/);
  assert.match(source, /assertProfessionalClinicalSession\(\)/);
});

test('legacy encrypted database remains available and is never deleted by isolation bootstrap', () => {
  const source = read('main.js');
  const isolationMain = read('js/core/local-data-isolation-main.js');
  assert.match(source, /plennus-clinic\.db\.enc/);
  assert.match(isolationMain, /plennus-clinic\.db\.enc/);
  assert.doesNotMatch(isolationMain, /unlinkSync\(legacyPath/);
});