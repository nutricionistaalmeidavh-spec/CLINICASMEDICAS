const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('direct page navigation is guarded by the centralized permission matrix', () => {
  const navigation = read('js/core/navigation.js');
  assert.match(navigation, /canNavigateToPage/);
  assert.match(navigation, /if \(!canNavigate\(page\)\)/);
  assert.match(navigation, /return false/);
});

test('settings protects clinic identity, user administration and backup actions', () => {
  const settings = read('js/domains/settings.js');
  assert.match(settings, /canManageClinicSettings/);
  assert.match(settings, /canManageUsers/);
  assert.match(settings, /canManageBackups/);
  assert.match(settings, /último administrador ativo/i);
  assert.match(settings, /mínimo 10 caracteres/i);
});

test('legacy default password must be replaced before entering the application', () => {
  const auth = read('js/core/auth.js');
  assert.match(auth, /requireDefaultPasswordReplacement/);
  assert.match(auth, /suppliedPassword !== '123'/);
  assert.match(auth, /pelo menos 10 caracteres/i);
  assert.match(auth, /UPDATE usuarios SET senha=/);
});

test('restore validates SQLite integrity before replacing the active database', () => {
  const database = read('js/database.js');
  assert.match(database, /PRAGMA integrity_check/);
  for (const table of ['usuarios', 'pacientes', 'agenda', 'configuracoes']) {
    assert.ok(database.includes(`'${table}'`), `restore should require ${table}`);
  }
  assert.match(database, /restoreValidatedDatabase/);
});

test('desktop restore creates a pre-restore safety snapshot before handing data to renderer', () => {
  const main = read('main.js');
  assert.match(main, /createSafetySnapshot\('pre-restore'\)/);
  assert.match(main, /decryptBackup/);
  assert.match(main, /Backup Plennus criptografado/);
});

test('legacy cash and payout mutations enforce role checks', () => {
  const finance = read('js/domains/finance.js');
  assert.match(finance, /if \(!canManageCash\(\)\)/);
  assert.match(finance, /if \(!canManagePayouts\(\)\)/);
});
