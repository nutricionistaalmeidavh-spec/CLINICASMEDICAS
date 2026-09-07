'use strict';

const fs = require('node:fs');
const path = require('node:path');
const core = require('./fiscal-core');
const { createFocusClient } = require('./focus-client');

const FISCAL_CONNECTION_FILENAME = 'fiscal-connection.enc';
const MAX_FISCAL_PAYLOAD_BYTES = 128 * 1024;
const FISCAL_DOCUMENT_TYPES = new Set(['nfse', 'nfsen']);

function connectionPath(app) {
  return path.join(app.getPath('userData'), FISCAL_CONNECTION_FILENAME);
}

function validateDocumentType(value) {
  const documentType = String(value || '').toLowerCase();
  if (!FISCAL_DOCUMENT_TYPES.has(documentType)) throw new Error('Tipo de documento fiscal não suportado.');
  return core.validateDocumentType(documentType);
}

function publicConnection(connection) {
  if (!connection) return { configured: false };
  const metadata = core.validateConnection(connection);
  return { configured: true, ...metadata };
}

function assertPayloadSize(value) {
  const text = JSON.stringify(value == null ? null : value);
  if (Buffer.byteLength(text, 'utf8') > MAX_FISCAL_PAYLOAD_BYTES) {
    throw new Error('Payload fiscal excede o limite permitido.');
  }
  return value;
}

function createConnectionStore({ app, safeStorage }) {
  function readSecret() {
    const filePath = connectionPath(app);
    if (!fs.existsSync(filePath)) return null;
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia do sistema operacional indisponível.');
    const encrypted = fs.readFileSync(filePath);
    const parsed = JSON.parse(safeStorage.decryptString(encrypted));
    return core.validateSecretConnection(parsed);
  }

  function saveSecret(input) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia do sistema operacional indisponível.');
    const secret = core.validateSecretConnection(input);
    const filePath = connectionPath(app);
    const encrypted = safeStorage.encryptString(JSON.stringify(secret));
    fs.writeFileSync(filePath, encrypted, { mode: 0o600 });
    return publicConnection(secret);
  }

  function removeSecret() {
    const filePath = connectionPath(app);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); }
    catch (error) { throw new Error(`Não foi possível remover a conexão fiscal: ${error.message}`); }
    return { configured: false };
  }

  return { readSecret, saveSecret, removeSecret };
}

function registerFiscalIpc({ ipcMain, app, safeStorage, fetchImpl = globalThis.fetch, isTrustedSender = null }) {
  if (!ipcMain || !app || !safeStorage) throw new Error('Dependências do módulo fiscal incompletas.');
  const store = createConnectionStore({ app, safeStorage });
  const client = createFocusClient({ fetchImpl });

  function trusted(event) {
    if (typeof isTrustedSender !== 'function') return true;
    return Boolean(isTrustedSender(event));
  }

  function handle(channel, fn) {
    ipcMain.handle(channel, async (event, input) => {
      if (!trusted(event)) return { ok: false, error: 'Origem IPC não autorizada.' };
      try { return await fn(input || {}); }
      catch (error) { return { ok: false, error: error?.message || 'Falha no módulo fiscal.' }; }
    });
  }

  handle('fiscal:status', async () => ({ ok: true, ...publicConnection(store.readSecret()) }));

  handle('fiscal:save-connection', async (input) => {
    assertPayloadSize(input);
    validateDocumentType(input.documentType || 'nfsen');
    const metadata = store.saveSecret(input);
    return { ok: true, ...metadata };
  });

  handle('fiscal:remove-connection', async () => ({ ok: true, ...store.removeSecret() }));

  handle('fiscal:test-connection', async () => {
    const connection = store.readSecret();
    if (!connection) return { ok: false, error: 'Nenhuma conta fiscal conectada.' };
    const documentType = validateDocumentType(connection.documentType);
    return client.testConnection({ connection, documentType });
  });

  handle('fiscal:emit', async (input) => {
    assertPayloadSize(input);
    const connection = store.readSecret();
    if (!connection) return { ok: false, error: 'Nenhuma conta fiscal conectada.' };
    const documentType = validateDocumentType(input.documentType || connection.documentType);
    const reference = core.validateReference(input.reference);
    const payload = assertPayloadSize(input.payload || {});
    return client.emit({ connection, documentType, reference, payload });
  });

  handle('fiscal:query', async (input) => {
    assertPayloadSize(input);
    const connection = store.readSecret();
    if (!connection) return { ok: false, error: 'Nenhuma conta fiscal conectada.' };
    return client.query({
      connection,
      documentType: validateDocumentType(input.documentType || connection.documentType),
      reference: core.validateReference(input.reference)
    });
  });

  handle('fiscal:cancel', async (input) => {
    assertPayloadSize(input);
    const connection = store.readSecret();
    if (!connection) return { ok: false, error: 'Nenhuma conta fiscal conectada.' };
    return client.cancel({
      connection,
      documentType: validateDocumentType(input.documentType || connection.documentType),
      reference: core.validateReference(input.reference),
      justification: input.justification
    });
  });

  return { store };
}

module.exports = {
  registerFiscalIpc,
  createConnectionStore,
  validateDocumentType,
  MAX_FISCAL_PAYLOAD_BYTES,
  FISCAL_CONNECTION_FILENAME,
  FISCAL_DOCUMENT_TYPES
};
