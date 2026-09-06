const crypto = require('crypto');

const FORMAT = 'PLENNUS_BACKUP_V1';
const KDF = 'pbkdf2-sha256';
const ITERATIONS = 210000;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
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

function encryptBackup(data, password, now = new Date()) {
  const plaintext = validateSqliteBytes(data);
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    format: FORMAT,
    createdAt: now.toISOString(),
    kdf: KDF,
    iterations: ITERATIONS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  });
}

function parseEnvelope(text) {
  let envelope;
  try { envelope = JSON.parse(String(text || '')); }
  catch (_) { throw new Error('Formato de backup inválido.'); }
  if (envelope?.format !== FORMAT || envelope.kdf !== KDF) throw new Error('Formato de backup não suportado.');
  const iterations = Number(envelope.iterations);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) throw new Error('Parâmetros criptográficos inválidos.');
  for (const field of ['salt', 'iv', 'tag', 'ciphertext']) {
    if (typeof envelope[field] !== 'string' || !envelope[field]) throw new Error('Backup incompleto.');
  }
  return { ...envelope, iterations };
}

function decryptBackup(text, password) {
  const envelope = parseEnvelope(text);
  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || tag.length !== 16 || ciphertext.length > MAX_BACKUP_BYTES + 64) {
    throw new Error('Estrutura criptográfica do backup inválida.');
  }

  try {
    const key = deriveKey(password, salt, envelope.iterations);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return validateSqliteBytes(plaintext);
  } catch (error) {
    if (/senha|password/i.test(error.message)) throw error;
    throw new Error('Não foi possível descriptografar o backup. Verifique a senha e a integridade do arquivo.');
  }
}

function isEncryptedBackupText(text) {
  try { return JSON.parse(String(text || ''))?.format === FORMAT; }
  catch (_) { return false; }
}

module.exports = {
  FORMAT,
  KDF,
  ITERATIONS,
  MAX_BACKUP_BYTES,
  validateSqliteBytes,
  validatePassword,
  encryptBackup,
  decryptBackup,
  isEncryptedBackupText
};
