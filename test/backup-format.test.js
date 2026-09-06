const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');
const backup = require('../js/core/backup-format');

async function sqliteBytes() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE pacientes (id INTEGER PRIMARY KEY, nome TEXT)');
  db.run("INSERT INTO pacientes (id,nome) VALUES (1,'Paciente Teste')");
  const bytes = db.export();
  db.close();
  return bytes;
}

test('portable backup encrypts and decrypts a real SQLite database', async () => {
  const source = await sqliteBytes();
  const encrypted = backup.encryptBackup(source, 'senha-forte-123', new Date('2026-09-06T12:00:00.000Z'));
  assert.match(encrypted, /PLENNUS_BACKUP_V1/);
  assert.equal(encrypted.includes('Paciente Teste'), false);

  const restored = backup.decryptBackup(encrypted, 'senha-forte-123');
  assert.deepEqual(Array.from(restored), Array.from(source));
});

test('encrypted backup rejects wrong password or tampered authentication tag', async () => {
  const source = await sqliteBytes();
  const encrypted = backup.encryptBackup(source, 'senha-forte-123');
  assert.throws(() => backup.decryptBackup(encrypted, 'senha-errada-999'), /descriptografar/i);

  const envelope = JSON.parse(encrypted);
  envelope.tag = Buffer.alloc(16, 1).toString('base64');
  assert.throws(() => backup.decryptBackup(JSON.stringify(envelope), 'senha-forte-123'), /descriptografar/i);
});

test('backup format refuses weak passwords and non-SQLite payloads', () => {
  assert.throws(() => backup.encryptBackup(Buffer.from('not sqlite'), 'senha-forte-123'), /SQLite válido/i);
  assert.throws(() => backup.validatePassword('curta'), /10 caracteres/i);
});
