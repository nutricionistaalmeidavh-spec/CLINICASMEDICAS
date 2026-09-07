const test = require('node:test');
const assert = require('node:assert/strict');

const backup = require('../js/core/backup-format.js');

function sqliteBytes(marker) {
  return Buffer.concat([
    Buffer.from('SQLite format 3\0', 'binary'),
    Buffer.from(String(marker || 'db')),
    Buffer.alloc(64)
  ]);
}

function sampleComposite() {
  return {
    clinicUid: 'clinic-001',
    clinicDatabase: sqliteBytes('clinic'),
    professionals: [
      {
        professionalUid: 'prof-a',
        database: sqliteBytes('prof-a'),
        files: [
          { relativePath: 'exam-a.pdf', mimeType: 'application/pdf', data: Buffer.from('PDF-A') }
        ]
      },
      {
        professionalUid: 'prof-b',
        database: sqliteBytes('prof-b'),
        files: [
          { relativePath: 'images/photo.jpg', mimeType: 'image/jpeg', data: Buffer.from('JPEG-B') }
        ]
      }
    ]
  };
}

test('V3 composite backup round-trips clinic, two professional DBs and professional files', () => {
  const encrypted = backup.encryptCompositeBackup(sampleComposite(), 'senha-forte-123', new Date('2026-09-07T00:00:00Z'));
  const envelope = JSON.parse(encrypted);
  assert.equal(envelope.format, 'PLENNUS_BACKUP_V3');
  assert.equal(encrypted.includes('PDF-A'), false);
  assert.equal(encrypted.includes('prof-a'), false);

  const restored = backup.decryptCompositeBackup(encrypted, 'senha-forte-123');
  assert.equal(restored.manifest.formatVersion, 3);
  assert.equal(restored.manifest.clinicUid, 'clinic-001');
  assert.deepEqual(restored.clinicDatabase, sqliteBytes('clinic'));
  assert.equal(restored.professionals.length, 2);
  assert.deepEqual(restored.professionals[0].database, sqliteBytes('prof-a'));
  assert.deepEqual(restored.professionals[0].files[0].data, Buffer.from('PDF-A'));
  assert.deepEqual(restored.professionals[1].files[0].data, Buffer.from('JPEG-B'));
});

test('V3 validates manifest hashes and rejects altered composite payloads', () => {
  const payload = backup.buildCompositePayload(sampleComposite(), new Date('2026-09-07T00:00:00Z'));
  assert.doesNotThrow(() => backup.validateCompositePayload(payload));
  payload.professionals[0].files[0].data = Buffer.from('TAMPERED').toString('base64');
  assert.throws(() => backup.validateCompositePayload(payload), /hash|integridade/i);
});

test('V3 rejects traversal, duplicate professionals and wrong passwords', () => {
  const traversal = sampleComposite();
  traversal.professionals[0].files[0].relativePath = '../foreign.pdf';
  assert.throws(() => backup.encryptCompositeBackup(traversal, 'senha-forte-123'), /caminho/i);

  const duplicate = sampleComposite();
  duplicate.professionals[1].professionalUid = 'prof-a';
  assert.throws(() => backup.encryptCompositeBackup(duplicate, 'senha-forte-123'), /duplicad/i);

  const encrypted = backup.encryptCompositeBackup(sampleComposite(), 'senha-forte-123');
  assert.throws(() => backup.decryptCompositeBackup(encrypted, 'senha-errada-456'), /descriptografar|senha|integridade/i);
});

test('V1 and V2 backup contracts remain readable after V3 introduction', () => {
  const db = sqliteBytes('legacy');
  const v1 = backup.encryptBackup(db, 'senha-forte-123');
  assert.deepEqual(backup.decryptBackup(v1, 'senha-forte-123'), db);

  const v2 = backup.encryptPortableBackup(db, [{ relativePath: 'old.pdf', data: Buffer.from('old') }], 'senha-forte-123');
  const restoredV2 = backup.decryptPortableBackup(v2, 'senha-forte-123');
  assert.deepEqual(restoredV2.databaseBytes, db);
  assert.deepEqual(restoredV2.files[0].data, Buffer.from('old'));
});
