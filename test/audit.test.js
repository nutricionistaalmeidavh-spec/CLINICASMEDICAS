const test = require('node:test');
const assert = require('node:assert/strict');
const audit = require('../js/core/audit');

test('audit sanitizer removes secrets and binary-like payloads', () => {
  const clean = audit.sanitizePayload({ nome: 'Ana', senha: 'x', hash: 'y', base64: 'AAAA', arquivoBase64: 'BBBB', campo: 1 });
  assert.equal(clean.nome, 'Ana');
  assert.equal(clean.campo, 1);
  assert.equal('senha' in clean, false);
  assert.equal('hash' in clean, false);
  assert.equal('base64' in clean, false);
  assert.equal('arquivoBase64' in clean, false);
});

test('migration audit actor is system/migration', () => {
  assert.deepEqual(audit.actorFromUser(null, 'migration'), { id: null, nome: 'system', nivel: 'migration' });
});
