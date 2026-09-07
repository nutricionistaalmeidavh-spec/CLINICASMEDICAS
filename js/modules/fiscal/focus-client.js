'use strict';

const core = require('./fiscal-core');

const BASE_URLS = Object.freeze({
  homologation: 'https://homologacao.focusnfe.com.br',
  production: 'https://api.focusnfe.com.br'
});

const ROUTES = Object.freeze({ nfse: 'nfse', nfsen: 'nfsen' });
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

function parseBody(text, contentType) {
  if (!text) return null;
  if (String(contentType || '').includes('application/json')) {
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
  }
  try { return JSON.parse(text); } catch (_) { return { raw: text }; }
}

function createFocusClient({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Cliente HTTP indisponível.');

  async function request({ connection, documentType, reference, method = 'GET', payload }) {
    const secret = core.validateSecretConnection(connection);
    const type = core.validateDocumentType(documentType || secret.documentType);
    const ref = core.validateReference(reference);
    const baseUrl = BASE_URLS[secret.environment];
    const route = ROUTES[type];
    const suffix = method === 'POST'
      ? `/v2/${route}?ref=${encodeURIComponent(ref)}`
      : `/v2/${route}/${encodeURIComponent(ref)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers = {
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${secret.token}:`, 'utf8').toString('base64')}`
    };
    const options = { method, headers, signal: controller.signal };
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(payload);
    }

    try {
      const response = await fetchImpl(`${baseUrl}${suffix}`, options);
      const contentLength = Number(response.headers?.get?.('content-length') || 0);
      if (contentLength > MAX_RESPONSE_BYTES) throw new Error('Resposta fiscal excede o limite permitido.');
      const text = await response.text();
      if (Buffer.byteLength(text || '', 'utf8') > MAX_RESPONSE_BYTES) throw new Error('Resposta fiscal excede o limite permitido.');
      const data = parseBody(text, response.headers?.get?.('content-type'));
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      if (error?.name === 'AbortError') return { ok: false, status: 0, error: 'Tempo limite excedido ao consultar o provedor fiscal.' };
      return { ok: false, status: 0, error: error?.message || 'Falha de comunicação com o provedor fiscal.' };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async testConnection({ connection, documentType }) {
      const type = core.validateDocumentType(documentType || connection?.documentType);
      const result = await request({ connection, documentType: type, reference: 'FISCALCONNECTIONCHECK', method: 'GET' });
      if (result.status === 401) return { ok: false, authenticated: false, status: 401, error: 'Token fiscal inválido.' };
      if (result.status === 403) return { ok: false, authenticated: true, status: 403, error: 'Conta autenticada, mas sem permissão para este tipo de documento.' };
      if (result.status === 0) return result;
      return { ok: true, authenticated: true, status: result.status };
    },

    emit({ connection, documentType, reference, payload }) {
      return request({ connection, documentType, reference, method: 'POST', payload });
    },

    query({ connection, documentType, reference }) {
      return request({ connection, documentType, reference, method: 'GET' });
    },

    cancel({ connection, documentType, reference, justification }) {
      const text = String(justification || '').trim();
      if (text.length < 15 || text.length > 255) throw new Error('A justificativa deve ter entre 15 e 255 caracteres.');
      return request({ connection, documentType, reference, method: 'DELETE', payload: { justificativa: text } });
    }
  };
}

module.exports = { createFocusClient, BASE_URLS };
