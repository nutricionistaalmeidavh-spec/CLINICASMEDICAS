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

test('database instrumentation records relevant patient write after the primary write', () => {
  const calls = [];
  const previousDb = global.DB;
  const stub = {
    run(sql, params = []) { calls.push({ sql, params }); return 1; },
    getLastId() { return 42; }
  };
  global.DB = stub;
  audit.installDbAudit(stub);
  stub.run('INSERT INTO pacientes (nome,cpf) VALUES (?,?)', ['Ana', '123']);
  assert.match(calls[0].sql, /^INSERT INTO pacientes/);
  assert.equal(calls.filter(call => /INSERT INTO audit_log/.test(call.sql)).length, 1);
  const auditCall = calls.find(call => /INSERT INTO audit_log/.test(call.sql));
  assert.equal(auditCall.params[3], 'criar');
  assert.equal(auditCall.params[4], 'pacientes');
  assert.equal(auditCall.params[5], 42);
  if (previousDb === undefined) delete global.DB;
  else global.DB = previousDb;
});
