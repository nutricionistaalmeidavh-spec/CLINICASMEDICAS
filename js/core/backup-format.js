const crypto = require('crypto');

const FORMAT = 'PLENNUS_BACKUP_V1';
const PORTABLE_FORMAT = 'PLENNUS_BACKUP_V2';
const COMPOSITE_FORMAT = 'PLENNUS_BACKUP_V3';
const KDF = 'pbkdf2-sha256';
const ITERATIONS = 210000;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const MAX_PORTABLE_BACKUP_BYTES = 200 * 1024 * 1024;
const MAX_COMPOSITE_BACKUP_BYTES = 512 * 1024 * 1024;
const SQLITE_HEADER = Buffer.from('SQLite format 3\u0000', 'binary');
const SAFE_ID = /^[a-zA-Z0-9_-]{1,96}$/;

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return Buffer.from(data);
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.from(data);
  throw new Error('Dados de backup inválidos.');
}

function validateSqliteBytes(data) {
  const buffer = toBuffer(data);
  if (!buffer.length || buffer.length > MAX_BACKUP_BYTES) throw new Error('Tamanho de backup inválido.');
  if (buffer.length < SQLITE_HEADER.length || !buffer.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER)) {
    throw new Error('O arquivo não contém um banco SQLite válido.');
  }
  return buffer;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 10) throw new Error('A senha do backup deve ter pelo menos 10 caracteres.');
  if (password.length > 256) throw new Error('Senha de backup inválida.');
  return password;
}

function deriveKey(password, salt, iterations = ITERATIONS) {
  return crypto.pbkdf2Sync(validatePassword(password), salt, iterations, KEY_BYTES, 'sha256');
}

function encryptPayload(plaintext, password, format, now = new Date()) {
  const source = toBuffer(plaintext);
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(source), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    format,
    createdAt: now.toISOString(),
    kdf: KDF,
    iterations: ITERATIONS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  });
}

function encryptBackup(data, password, now = new Date()) {
  return encryptPayload(validateSqliteBytes(data), password, FORMAT, now);
}

function normalizeRelativePath(input) {
  const relativePath = String(input || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!relativePath || relativePath.includes('..') || relativePath.includes('\u0000') || /^[a-zA-Z]:/.test(relativePath)) {
    throw new Error('Caminho de anexo inválido.');
  }
  const segments = relativePath.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) throw new Error('Caminho de anexo inválido.');
  return relativePath;
}

function normalizePortableFiles(files = []) {
  if (!Array.isArray(files)) throw new Error('Lista de anexos inválida.');
  return files.map((file, index) => {
    const relativePath = normalizeRelativePath(file?.relativePath || file?.name || `arquivo-${index + 1}`);
    const data = toBuffer(file?.data || []);
    return {
      relativePath,
      name: String(file?.name || relativePath.split('/').pop() || 'arquivo'),
      mimeType: file?.mimeType ? String(file.mimeType) : null,
      data: data.toString('base64')
    };
  });
}

function encryptPortableBackup(databaseData, files, password, now = new Date()) {
  const databaseBytes = validateSqliteBytes(databaseData);
  const payload = Buffer.from(JSON.stringify({
    database: databaseBytes.toString('base64'),
    files: normalizePortableFiles(files)
  }), 'utf8');
  if (payload.length > MAX_PORTABLE_BACKUP_BYTES) throw new Error('Backup com anexos excede o limite permitido.');
  return encryptPayload(payload, password, PORTABLE_FORMAT, now);
}

function sha256(data) {
  return crypto.createHash('sha256').update(toBuffer(data)).digest('hex');
}

function normalizeProfessionalUid(value) {
  const uid = String(value || '').trim();
  if (!SAFE_ID.test(uid)) throw new Error('Identificador profissional inválido no backup.');
  return uid;
}

function buildCompositePayload(input = {}, now = new Date()) {
  const clinicUid = String(input.clinicUid || '').trim();
  if (!SAFE_ID.test(clinicUid)) throw new Error('Identificador da clínica inválido no backup.');
  const clinicDatabase = validateSqliteBytes(input.clinicDatabase);
  const professionalsInput = Array.isArray(input.professionals) ? input.professionals : [];
  const seenProfessionals = new Set();
  const professionals = [];
  const manifestProfessionals = [];

  for (const item of professionalsInput) {
    const professionalUid = normalizeProfessionalUid(item?.professionalUid);
    if (seenProfessionals.has(professionalUid)) throw new Error('Profissional duplicado no backup composto.');
    seenProfessionals.add(professionalUid);
    const database = validateSqliteBytes(item?.database);
    const fileInputs = Array.isArray(item?.files) ? item.files : [];
    const seenFiles = new Set();
    const files = [];
    const manifestFiles = [];

    for (const file of fileInputs) {
      const relativePath = normalizeRelativePath(file?.relativePath || file?.name);
      if (seenFiles.has(relativePath)) throw new Error('Caminho de arquivo duplicado no backup composto.');
      seenFiles.add(relativePath);
      const bytes = toBuffer(file?.data || []);
      const fileHash = sha256(bytes);
      files.push({
        relativePath,
        name: String(file?.name || relativePath.split('/').pop()),
        mimeType: file?.mimeType ? String(file.mimeType) : null,
        sha256: fileHash,
        data: bytes.toString('base64')
      });
      manifestFiles.push({ relativePath, sha256: fileHash, size: bytes.length });
    }

    const databaseHash = sha256(database);
    professionals.push({ professionalUid, database: database.toString('base64'), files });
    manifestProfessionals.push({ professionalUid, databaseSha256: databaseHash, databaseSize: database.length, files: manifestFiles });
  }

  return {
    manifest: {
      formatVersion: 3,
      clinicUid,
      createdAt: now.toISOString(),
      clinicDatabaseSha256: sha256(clinicDatabase),
      clinicDatabaseSize: clinicDatabase.length,
      professionals: manifestProfessionals
    },
    clinicDatabase: clinicDatabase.toString('base64'),
    professionals
  };
}

function assertHash(actual, expected, label) {
  if (!/^[a-f0-9]{64}$/i.test(String(expected || '')) || actual !== String(expected)) {
    throw new Error(`Falha de integridade/hash em ${label}.`);
  }
}

function validateCompositePayload(payload) {
  if (!payload || typeof payload !== 'object' || payload.manifest?.formatVersion !== 3) throw new Error('Manifesto de backup composto inválido.');
  const clinicUid = String(payload.manifest.clinicUid || '').trim();
  if (!SAFE_ID.test(clinicUid)) throw new Error('Identificador da clínica inválido no manifesto.');
  const clinicDatabase = validateSqliteBytes(Buffer.from(String(payload.clinicDatabase || ''), 'base64'));
  assertHash(sha256(clinicDatabase), payload.manifest.clinicDatabaseSha256, 'clinic.db');
  if (Number(payload.manifest.clinicDatabaseSize) !== clinicDatabase.length) throw new Error('Falha de integridade no tamanho de clinic.db.');

  const professionals = Array.isArray(payload.professionals) ? payload.professionals : [];
  const manifestProfessionals = Array.isArray(payload.manifest.professionals) ? payload.manifest.professionals : [];
  if (professionals.length !== manifestProfessionals.length) throw new Error('Manifesto profissional inconsistente.');
  const manifestByUid = new Map();
  for (const manifestProfessional of manifestProfessionals) {
    const uid = normalizeProfessionalUid(manifestProfessional?.professionalUid);
    if (manifestByUid.has(uid)) throw new Error('Profissional duplicado no manifesto.');
    manifestByUid.set(uid, manifestProfessional);
  }

  const seen = new Set();
  const restoredProfessionals = [];
  for (const item of professionals) {
    const professionalUid = normalizeProfessionalUid(item?.professionalUid);
    if (seen.has(professionalUid)) throw new Error('Profissional duplicado no conteúdo do backup.');
    seen.add(professionalUid);
    const manifestProfessional = manifestByUid.get(professionalUid);
    if (!manifestProfessional) throw new Error('Profissional ausente do manifesto.');
    const database = validateSqliteBytes(Buffer.from(String(item?.database || ''), 'base64'));
    assertHash(sha256(database), manifestProfessional.databaseSha256, `clinical.db/${professionalUid}`);
    if (Number(manifestProfessional.databaseSize) !== database.length) throw new Error('Falha de integridade no tamanho do banco profissional.');

    const manifestFiles = Array.isArray(manifestProfessional.files) ? manifestProfessional.files : [];
    const manifestFilesByPath = new Map(manifestFiles.map(file => [normalizeRelativePath(file.relativePath), file]));
    const files = [];
    const seenFiles = new Set();
    for (const file of Array.isArray(item?.files) ? item.files : []) {
      const relativePath = normalizeRelativePath(file?.relativePath);
      if (seenFiles.has(relativePath)) throw new Error('Caminho de arquivo duplicado no conteúdo do backup.');
      seenFiles.add(relativePath);
      const manifestFile = manifestFilesByPath.get(relativePath);
      if (!manifestFile) throw new Error('Arquivo ausente do manifesto.');
      const data = Buffer.from(String(file?.data || ''), 'base64');
      assertHash(sha256(data), manifestFile.sha256, `arquivo ${professionalUid}/${relativePath}`);
      if (Number(manifestFile.size) !== data.length) throw new Error('Falha de integridade no tamanho de arquivo clínico.');
      files.push({ relativePath, name: String(file?.name || relativePath.split('/').pop()), mimeType: file?.mimeType || null, sha256: file.sha256, data });
    }
    if (files.length !== manifestFiles.length) throw new Error('Quantidade de arquivos diverge do manifesto.');
    restoredProfessionals.push({ professionalUid, database, files });
  }

  return { manifest: { ...payload.manifest }, clinicDatabase, professionals: restoredProfessionals };
}

function encryptCompositeBackup(input, password, now = new Date()) {
  const payload = buildCompositePayload(input, now);
  validateCompositePayload(payload);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  if (!plaintext.length || plaintext.length > MAX_COMPOSITE_BACKUP_BYTES) throw new Error('Backup composto excede o limite permitido.');
  return encryptPayload(plaintext, password, COMPOSITE_FORMAT, now);
}

function parseEnvelope(text, acceptedFormats = [FORMAT]) {
  let envelope;
  try { envelope = JSON.parse(String(text || '')); }
  catch (_) { throw new Error('Formato de backup inválido.'); }
  if (!acceptedFormats.includes(envelope?.format) || envelope.kdf !== KDF) throw new Error('Formato de backup não suportado.');
  const iterations = Number(envelope.iterations);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) throw new Error('Parâmetros criptográficos inválidos.');
  for (const field of ['salt', 'iv', 'tag', 'ciphertext']) {
    if (typeof envelope[field] !== 'string' || !envelope[field]) throw new Error('Backup incompleto.');
  }
  return { ...envelope, iterations };
}

function decryptEnvelope(text, password, acceptedFormats, maxBytes) {
  const envelope = parseEnvelope(text, acceptedFormats);
  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || tag.length !== 16 || ciphertext.length > maxBytes + 64) {
    throw new Error('Estrutura criptográfica do backup inválida.');
  }
  try {
    const key = deriveKey(password, salt, envelope.iterations);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return { format: envelope.format, plaintext: Buffer.concat([decipher.update(ciphertext), decipher.final()]) };
  } catch (error) {
    if (/senha|password/i.test(error.message)) throw error;
    throw new Error('Não foi possível descriptografar o backup. Verifique a senha e a integridade do arquivo.');
  }
}

function decryptBackup(text, password) {
  const result = decryptEnvelope(text, password, [FORMAT], MAX_BACKUP_BYTES);
  return validateSqliteBytes(result.plaintext);
}

function decryptPortableBackup(text, password) {
  const parsed = JSON.parse(String(text || '{}'));
  if (parsed?.format === FORMAT) return { databaseBytes: decryptBackup(text, password), files: [], legacy: true };
  const result = decryptEnvelope(text, password, [PORTABLE_FORMAT], MAX_PORTABLE_BACKUP_BYTES);
  let payload;
  try { payload = JSON.parse(result.plaintext.toString('utf8')); }
  catch (_) { throw new Error('Conteúdo do backup portátil inválido.'); }
  const databaseBytes = validateSqliteBytes(Buffer.from(String(payload?.database || ''), 'base64'));
  const files = Array.isArray(payload?.files) ? payload.files.map(file => {
    const relativePath = normalizeRelativePath(file?.relativePath || '');
    const data = Buffer.from(String(file?.data || ''), 'base64');
    return { relativePath, name: String(file?.name || ''), mimeType: file?.mimeType || null, data };
  }) : [];
  return { databaseBytes, files, legacy: false };
}

function decryptCompositeBackup(text, password) {
  const result = decryptEnvelope(text, password, [COMPOSITE_FORMAT], MAX_COMPOSITE_BACKUP_BYTES);
  let payload;
  try { payload = JSON.parse(result.plaintext.toString('utf8')); }
  catch (_) { throw new Error('Conteúdo do backup composto inválido.'); }
  return validateCompositePayload(payload);
}

function isEncryptedBackupText(text) {
  try { return [FORMAT, PORTABLE_FORMAT, COMPOSITE_FORMAT].includes(JSON.parse(String(text || ''))?.format); }
  catch (_) { return false; }
}

module.exports = {
  FORMAT,
  PORTABLE_FORMAT,
  COMPOSITE_FORMAT,
  KDF,
  ITERATIONS,
  MAX_BACKUP_BYTES,
  MAX_PORTABLE_BACKUP_BYTES,
  MAX_COMPOSITE_BACKUP_BYTES,
  validateSqliteBytes,
  validatePassword,
  normalizeRelativePath,
  sha256,
  buildCompositePayload,
  validateCompositePayload,
  encryptBackup,
  decryptBackup,
  encryptPortableBackup,
  decryptPortableBackup,
  encryptCompositeBackup,
  decryptCompositeBackup,
  isEncryptedBackupText
};
