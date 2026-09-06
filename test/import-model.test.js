const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/core/import-model');

test('maps common Portuguese patient headers', () => {
  assert.equal(model.normalizeHeader('Nome Completo'), 'nome');
  assert.equal(model.normalizeHeader('E-mail'), 'email');
  assert.equal(model.normalizeHeader('Data Nascimento'), 'data_nascimento');
  assert.equal(model.normalizeHeader('WhatsApp'), 'celular');
});

test('duplicate detection prioritizes CPF then name plus birthday', () => {
  const existing = [{ id: 1, nome: 'Ana Souza', cpf: '12345678909', data_nascimento: '01/01/1990' }];
  assert.equal(model.detectDuplicate({ nome: 'Outra', cpf: '123.456.789-09' }, existing).reason, 'cpf');
  assert.equal(model.detectDuplicate({ nome: 'Ana Souza', data_nascimento: '01/01/1990' }, existing).reason, 'nome_nascimento');
});

test('preview classifies valid, duplicate and invalid rows without writes', () => {
  const existing = [{ id: 1, nome: 'Ana Souza', cpf: '12345678909', data_nascimento: '01/01/1990' }];
  const preview = model.buildImportPreview([
    { 'Nome Completo': 'Bruno Lima', CPF: '98765432100' },
    { Nome: 'Ana Souza', 'Data Nascimento': '01/01/1990' },
    { CPF: '11122233344' }
  ], existing);
  assert.equal(preview.valid.length, 1);
  assert.equal(preview.duplicates.length, 1);
  assert.equal(preview.invalid.length, 1);
});
