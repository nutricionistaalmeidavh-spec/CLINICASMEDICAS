const crypto = require('crypto');

const FORMAT = 'PLENNUS_BACKUP_V1';
const PORTABLE_FORMAT = 'PLENNUS_BACKUP_V2';
const KDF = 'pbkdf2-sha256';
const ITERATIONS = 210000;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const MAX_PORTABLE_BACKUP_BYTES = 200 * 1024 * 1024;
const SQLITE_HEADER = Buffer.from('SQLite format 3\u0000', 'binary');

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

function normalizePortableFiles(files = []) {
  if (!Array.isArray(files)) throw new Error('Lista de anexos inválida.');
  return files.map((file, index) => {
    const relativePath = String(file?.relativePath || file?.name || `arquivo-${index + 1}`).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!relativePath || relativePath.includes('..')) throw new Error('Caminho de anexo inválido.');
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
    const relativePath = String(file?.relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!relativePath || relativePath.includes('..')) throw new Error('Backup contém caminho de anexo inválido.');
    const data = Buffer.from(String(file?.data || ''), 'base64');
    return { relativePath, name: String(file?.name || ''), mimeType: file?.mimeType || null, data };
  }) : [];
  return { databaseBytes, files, legacy: false };
}

function isEncryptedBackupText(text) {
  try { return [FORMAT, PORTABLE_FORMAT].includes(JSON.parse(String(text || ''))?.format); }
  catch (_) { return false; }
}

module.exports = {
  FORMAT,
  PORTABLE_FORMAT,
  KDF,
  ITERATIONS,
  MAX_BACKUP_BYTES,
  MAX_PORTABLE_BACKUP_BYTES,
  validateSqliteBytes,
  validatePassword,
  encryptBackup,
  decryptBackup,
  encryptPortableBackup,
  decryptPortableBackup,
  isEncryptedBackupText
};
