const crypto = require('node:crypto');

const PROTOCOL_VERSION = 1;
const MAX_CLOCK_SKEW_MS = 120 * 1000;

function isPrivateAddress(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return false;
  if (value === '::1') return true;
  if (value.startsWith('::ffff:')) return isPrivateAddress(value.slice(7));
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true;

  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 127 || parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
}

function normalizePairingSecret(secret) {
  return String(secret || '').replace(/[^a-fA-F0-9]/g, '').toUpperCase();
}

function pairingKey(secret) {
  return crypto.createHash('sha256').update(normalizePairingSecret(secret), 'utf8').digest();
}

function createPairingSecret() {
  return crypto.randomBytes(10).toString('hex').toUpperCase().match(/.{1,4}/g).join('-');
}

function pairingProof(secret, deviceId, nonce) {
  return crypto
    .createHmac('sha256', pairingKey(secret))
    .update(`pair:${String(deviceId || '')}:${String(nonce || '')}`, 'utf8')
    .digest('hex');
}

function normalizeKey(key) {
  const buffer = Buffer.isBuffer(key) ? key : Buffer.from(key || []);
  if (buffer.length !== 32) throw new Error('Chave de rede inválida.');
  return buffer;
}

function aadFor(deviceId) {
  return Buffer.from(`plennus-clinic-hub:v${PROTOCOL_VERSION}:${String(deviceId || '')}`, 'utf8');
}

function seal(key, deviceId, payload) {
  const normalizedKey = normalizeKey(key);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', normalizedKey, iv);
  cipher.setAAD(aadFor(deviceId));
  const plaintext = Buffer.from(JSON.stringify(payload ?? null), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    v: PROTOCOL_VERSION,
    iv: iv.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    tag: cipher.getAuthTag().toString('hex')
  };
}

function open(key, deviceId, envelope) {
  if (!envelope || Number(envelope.v) !== PROTOCOL_VERSION) throw new Error('Versão de protocolo inválida.');
  const normalizedKey = normalizeKey(key);
  const iv = Buffer.from(String(envelope.iv || ''), 'hex');
  const ciphertext = Buffer.from(String(envelope.ciphertext || ''), 'hex');
  const tag = Buffer.from(String(envelope.tag || ''), 'hex');
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error('Envelope criptográfico inválido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', normalizedKey, iv);
  decipher.setAAD(aadFor(deviceId));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

function isFreshTimestamp(timestamp, now = Date.now()) {
  const value = Number(timestamp);
  const reference = Number(now);
  if (!Number.isFinite(value) || !Number.isFinite(reference)) return false;
  return Math.abs(reference - value) <= MAX_CLOCK_SKEW_MS;
}

module.exports = {
  PROTOCOL_VERSION,
  MAX_CLOCK_SKEW_MS,
  isPrivateAddress,
  normalizePairingSecret,
  pairingKey,
  createPairingSecret,
  pairingProof,
  seal,
  open,
  isFreshTimestamp
};
