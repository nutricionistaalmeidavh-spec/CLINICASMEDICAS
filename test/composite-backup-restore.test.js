const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const initSqlJs = require('sql.js');

const backupFormat = require('../js/core/backup-format.js');
const { createCompositeBackupService } = require('../js/core/composite-backup-service.js');

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`enc:${value}`, 'utf8'),
    decryptString: value => {
      const text = Buffer.from(value).toString('utf8');
      if (!text.startsWith('enc:')) throw new Error('ciphertext inválido');
      return text.slice(4);
    }
  };
}

async function clinicDb(marker, clinicUid = 'clinic-001') {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE configuracoes (chave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT, usuario TEXT, senha TEXT, nivel TEXT, ativo INTEGER);
    CREATE TABLE profissionais (id INTEGER PRIMARY KEY, uid TEXT, nome TEXT);
    CREATE TABLE pacientes (id INTEGER PRIMARY KEY, uid TEXT, nome TEXT);
    CREATE TABLE agenda (id INTEGER PRIMARY KEY, paciente_id INTEGER, profissional_id INTEGER, status TEXT);
    INSERT INTO configuracoes VALUES ('clinic_uid', ?);
    INSERT INTO configuracoes VALUES ('marker', ?);`, [clinicUid, marker]);
  const bytes = Buffer.from(db.export());
  db.close();
  return bytes;
}

async function professionalDb(marker) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE pacientes (id INTEGER PRIMARY KEY, uid TEXT, nome TEXT);
    CREATE TABLE prontuario_atendimentos (id INTEGER PRIMARY KEY, paciente_id INTEGER, profissional_id INTEGER, plano_conduta TEXT);
    CREATE TABLE arquivos_clinicos (id INTEGER PRIMARY KEY, paciente_id INTEGER, caminho_arquivo TEXT);
    CREATE TABLE local_marker (value TEXT);
    INSERT INTO local_marker VALUES (?);`, [marker]);
  const bytes = Buffer.from(db.export());
  db.close();
  return bytes;
}

function writeEncryptedDb(filePath, bytes, safeStorage) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, safeStorage.encryptString(JSON.stringify(Array.from(bytes))));
}

function readEncryptedDb(filePath, safeStorage) {
  return Buffer.from(JSON.parse(safeStorage.decryptString(fs.readFileSync(filePath))));
}

async function markerFromClinic(bytes) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(bytes));
  const result = db.exec("SELECT valor FROM configuracoes WHERE chave='marker'");
  db.close();
  return result[0].values[0][0];
}

async function createActiveFixture(userData, safeStorage, marker = 'OLD') {
  writeEncryptedDb(path.join(userData, 'data', 'clinic', 'clinic.db.enc'), await clinicDb(marker), safeStorage);
  writeEncryptedDb(path.join(userData, 'data', 'professionals', 'prof-a', 'clinical.db.enc'), await professionalDb(`${marker}-A`), safeStorage);
  fs.mkdirSync(path.join(userData, 'data', 'professionals', 'prof-a', 'files'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'data', 'professionals', 'prof-a', 'files', 'old.pdf'), marker);
}

function isolationService() {
  return {
    requireSession(_event, token) {
      if (token === 'admin-token') return { token, role: 'admin', userId: 1, senderId: 10 };
      if (token === 'med-token') return { token, role: 'medico', userId: 2, professionalUid: 'prof-a', senderId: 10 };
      throw new Error('Sessão inválida.');
    },
    async getClinicUid() { return 'clinic-001'; }
  };
}

function event() { return { sender: { id: 10 } }; }

test('composite service saves every isolated database/file without exposing raw data to renderer', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'plennus-v3-save-'));
  const safeStorage = fakeSafeStorage();
  const backupPath = path.join(userData, 'clinic-backup.plennus3');
  try {
    await createActiveFixture(userData, safeStorage, 'SOURCE');
    const service = createCompositeBackupService({
      app: { getPath: () => userData }, safeStorage, isolationService: isolationService(),
      dialog: { showSaveDialog: async () => ({ canceled: false, filePath: backupPath }) }
    });
    const result = await service.save(event(), 'admin-token', 'senha-forte-123');
    assert.equal(result.ok, true);
    assert.equal(result.path, backupPath);
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'data'), false);
    const decrypted = backupFormat.decryptCompositeBackup(fs.readFileSync(backupPath, 'utf8'), 'senha-forte-123');
    assert.equal(decrypted.manifest.clinicUid, 'clinic-001');
    assert.deepEqual(decrypted.professionals.map(p => p.professionalUid), ['prof-a']);
    assert.deepEqual(decrypted.professionals[0].files[0].data, Buffer.from('SOURCE'));
  } finally { fs.rmSync(userData, { recursive: true, force: true }); }
});

test('V3 restore stages first, commits atomically and can rollback to exact prior data root', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'plennus-v3-restore-'));
  const safeStorage = fakeSafeStorage();
  const backupPath = path.join(userData, 'replacement.plennus3');
  try {
    await createActiveFixture(userData, safeStorage, 'OLD');
    const replacement = backupFormat.encryptCompositeBackup({
      clinicUid: 'clinic-001',
      clinicDatabase: await clinicDb('NEW'),
      professionals: [
        { professionalUid: 'prof-a', database: await professionalDb('NEW-A'), files: [{ relativePath: 'new.pdf', mimeType: 'application/pdf', data: Buffer.from('NEW-FILE') }] },
        { professionalUid: 'prof-b', database: await professionalDb('NEW-B'), files: [] }
      ]
    }, 'senha-forte-123');
    fs.writeFileSync(backupPath, replacement, 'utf8');

    const service = createCompositeBackupService({
      app: { getPath: () => userData }, safeStorage, isolationService: isolationService(),
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [backupPath] }) }
    });

    const staged = await service.open(event(), 'admin-token', 'senha-forte-123');
    assert.equal(staged.ok, true);
    assert.equal(staged.professionals, 2);
    assert.equal(staged.files, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(staged, 'clinicDatabase'), false);
    assert.equal(await markerFromClinic(readEncryptedDb(path.join(userData, 'data', 'clinic', 'clinic.db.enc'), safeStorage)), 'OLD');
    assert.equal(fs.existsSync(path.join(userData, 'data', 'professionals', 'prof-b')), false);

    const committed = await service.commit(event(), 'admin-token', staged.sessionId);
    assert.equal(committed.ok, true);
    assert.equal(await markerFromClinic(readEncryptedDb(path.join(userData, 'data', 'clinic', 'clinic.db.enc'), safeStorage)), 'NEW');
    assert.equal(fs.readFileSync(path.join(userData, 'data', 'professionals', 'prof-a', 'files', 'new.pdf'), 'utf8'), 'NEW-FILE');
    assert.equal(fs.existsSync(path.join(userData, 'data', 'professionals', 'prof-a', 'files', 'old.pdf')), false);
    assert.equal(fs.existsSync(path.join(userData, 'data', 'professionals', 'prof-b', 'clinical.db.enc')), true);

    const rolledBack = await service.rollback(event(), 'admin-token', staged.sessionId);
    assert.equal(rolledBack.ok, true);
    assert.equal(await markerFromClinic(readEncryptedDb(path.join(userData, 'data', 'clinic', 'clinic.db.enc'), safeStorage)), 'OLD');
    assert.equal(fs.readFileSync(path.join(userData, 'data', 'professionals', 'prof-a', 'files', 'old.pdf'), 'utf8'), 'OLD');
    assert.equal(fs.existsSync(path.join(userData, 'data', 'professionals', 'prof-b')), false);
  } finally { fs.rmSync(userData, { recursive: true, force: true }); }
});

test('wrong password, cancelled staging and non-admin sessions cannot alter active data', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'plennus-v3-deny-'));
  const safeStorage = fakeSafeStorage();
  const backupPath = path.join(userData, 'replacement.plennus3');
  try {
    await createActiveFixture(userData, safeStorage, 'OLD');
    fs.writeFileSync(backupPath, backupFormat.encryptCompositeBackup({
      clinicUid: 'clinic-001', clinicDatabase: await clinicDb('NEW'), professionals: []
    }, 'senha-forte-123'), 'utf8');

    const service = createCompositeBackupService({
      app: { getPath: () => userData }, safeStorage, isolationService: isolationService(),
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [backupPath] }), showSaveDialog: async () => ({ canceled: true }) }
    });

    await assert.rejects(() => service.open(event(), 'med-token', 'senha-forte-123'), /administrador/i);
    await assert.rejects(() => service.save(event(), 'med-token', 'senha-forte-123'), /administrador/i);
    await assert.rejects(() => service.open(event(), 'admin-token', 'senha-errada-456'), /descriptografar|senha|integridade/i);
    assert.equal(await markerFromClinic(readEncryptedDb(path.join(userData, 'data', 'clinic', 'clinic.db.enc'), safeStorage)), 'OLD');

    const staged = await service.open(event(), 'admin-token', 'senha-forte-123');
    const cancelled = await service.cancel(event(), 'admin-token', staged.sessionId);
    assert.equal(cancelled.ok, true);
    await assert.rejects(() => service.commit(event(), 'admin-token', staged.sessionId), /sessão|staging|restauração/i);
    assert.equal(await markerFromClinic(readEncryptedDb(path.join(userData, 'data', 'clinic', 'clinic.db.enc'), safeStorage)), 'OLD');
  } finally { fs.rmSync(userData, { recursive: true, force: true }); }
});
