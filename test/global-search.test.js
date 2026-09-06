const test = require('node:test');
const assert = require('node:assert/strict');
const search = require('../js/core/global-search');

test('normalizes accents, spaces and CPF punctuation', () => {
  assert.equal(search.normalizeSearchTerm('  José   Silva '), 'jose silva');
  assert.equal(search.normalizeCpf('123.456.789-09'), '12345678909');
});

test('global search destination respects current role permissions', () => {
  assert.equal(search.destinationForRole('admin'), 'prontuario');
  assert.equal(search.destinationForRole('medico'), 'prontuario');
  assert.equal(search.destinationForRole('recepcao'), 'pacientes');
});

test('patient search query is parameterized and bounded', () => {
  const built = search.buildPatientSearchSql('maria', 8);
  assert.match(built.sql, /WHERE ativo=1/);
  assert.match(built.sql, /LIMIT \?/);
  assert.equal(built.params.at(-1), 8);
  assert.ok(built.params.length >= 2);
});
