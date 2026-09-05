const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/core/clinical-model.js');

test('revoked consent is never displayed as active', () => {
  assert.equal(model.consentStatus({ autorizado: 1, aceito_em: '2026-09-01', revogado_em: '2026-09-05' }), 'revogado');
});

test('explicit refusal stays not authorized', () => {
  assert.equal(model.consentStatus({ autorizado: 0, aceito_em: null, revogado_em: null }), 'nao_autorizado');
});
