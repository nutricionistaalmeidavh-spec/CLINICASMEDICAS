const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const inventory = require('../js/core/composite-backup-main.js');

function sqliteBytes(marker) {
  return Buffer.concat([Buffer.from('SQLite format 3\0', 'binary'), Buffer.from(String(marker)), Buffer.alloc(64)]);
}

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

function writeEncryptedDb(filePath, bytes, safeStorage) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, safeStorage.encryptString(JSON.stringify(Array.from(bytes))));
}

function fixture() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'plennus-composite-'));
  const safeStorage = fakeSafeStorage();
  writeEncryptedDb(path.join(userData, 'data', 'clinic', 'clinic.db.enc'), sqliteBytes('clinic'), safeStorage);
  writeEncryptedDb(path.join(userData, 'data', 'professionals', 'prof-a', 'clinical.db.enc'), sqliteBytes('a'), safeStorage);
  writeEncryptedDb(path.join(userData, 'data', 'professionals', 'prof-b', 'clinical.db.enc'), sqliteBytes('b'), safeStorage);
  fs.mkdirSync(path.join(userData, 'data', 'professionals', 'prof-a', 'files'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'data', 'professionals', 'prof-a', 'files', 'exam.pdf'), 'A');
  fs.mkdirSync(path.join(userData, 'data', 'professionals', 'prof-b', 'files', 'images'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'data', 'professionals', 'prof-b', 'files', 'images', 'photo.jpg'), 'B');
  return { userData, safeStorage };
}

test('inventory exports clinic plus every professional database and professional-scoped files', () => {
  const { userData, safeStorage } = fixture();
  try {
    const result = inventory.exportCompositeInventory({ userData, safeStorage, clinicUid: 'clinic-001' });
    assert.equal(result.clinicUid, 'clinic-001');
    assert.deepEqual(result.clinicDatabase, sqliteBytes('clinic'));
    assert.deepEqual(result.professionals.map(p => p.professionalUid), ['prof-a', 'prof-b']);
    assert.deepEqual(result.professionals[0].database, sqliteBytes('a'));
    assert.deepEqual(result.professionals[0].files.map(f => f.relativePath), ['exam.pdf']);
    assert.deepEqual(result.professionals[0].files[0].data, Buffer.from('A'));
    assert.deepEqual(result.professionals[1].files.map(f => f.relativePath), ['images/photo.jpg']);
  } finally { fs.rmSync(userData, { recursive: true, force: true }); }
});

test('inventory rejects malformed professional directories instead of silently omitting data', () => {
  const { userData, safeStorage } = fixture();
  try {
    writeEncryptedDb(path.join(userData, 'data', 'professionals', 'bad.uid', 'clinical.db.enc'), sqliteBytes('bad'), safeStorage);
    assert.throws(() => inventory.exportCompositeInventory({ userData, safeStorage, clinicUid: 'clinic-001' }), /profissional|diretório|identificador/i);
  } finally { fs.rmSync(userData, { recursive: true, force: true }); }
});

test('inventory rejects symlinks in clinical file trees', { skip: process.platform === 'win32' }, () => {
  const { userData, safeStorage } = fixture();
  const outside = path.join(userData, 'outside.txt');
  try {
    fs.writeFileSync(outside, 'foreign');
    fs.symlinkSync(outside, path.join(userData, 'data', 'professionals', 'prof-a', 'files', 'link.txt'));
    assert.throws(() => inventory.exportCompositeInventory({ userData, safeStorage, clinicUid: 'clinic-001' }), /link|simbólic/i);
  } finally { fs.rmSync(userData, { recursive: true, force: true }); }
});

test('inventory refuses unavailable OS encryption and invalid encrypted database payloads', () => {
  const { userData, safeStorage } = fixture();
  try {
    assert.throws(() => inventory.exportCompositeInventory({ userData, safeStorage: { ...safeStorage, isEncryptionAvailable: () => false }, clinicUid: 'clinic-001' }), /criptografia/i);
    fs.writeFileSync(path.join(userData, 'data', 'professionals', 'prof-a', 'clinical.db.enc'), Buffer.from('garbage'));
    assert.throws(() => inventory.exportCompositeInventory({ userData, safeStorage, clinicUid: 'clinic-001' }), /banco|criptograf|inválid/i);
  } finally { fs.rmSync(userData, { recursive: true, force: true }); }
});
