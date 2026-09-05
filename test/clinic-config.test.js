const test = require('node:test');
const assert = require('node:assert/strict');
const { mapClinicConfigRows } = require('../js/core/clinic.js');

test('maps database configuration rows to the clinic identity contract', () => {
  const result = mapClinicConfigRows([
    { chave: 'nome_clinica', valor: 'Plennus Teste' },
    { chave: 'endereco_clinica', valor: 'Rua A, 10' },
    { chave: 'telefone_clinica', valor: '(16) 99999-0000' },
    { chave: 'cidade_clinica', valor: 'Ribeirão Preto - SP' },
    { chave: 'cnpj_clinica', valor: '00.000.000/0001-00' },
    { chave: 'cor_primaria', valor: '#C41E3A' },
  ]);

  assert.deepEqual(result, {
    nome: 'Plennus Teste',
    endereco: 'Rua A, 10',
    telefone: '(16) 99999-0000',
    cidade: 'Ribeirão Preto - SP',
    cnpj: '00.000.000/0001-00',
    cor: '#C41E3A',
  });
});

test('uses the same fallback clinic identity as the legacy application', () => {
  assert.deepEqual(mapClinicConfigRows([]), {
    nome: 'Plennus Clinic',
    endereco: 'Endereço da Clínica',
    telefone: '(00) 0000-0000',
    cidade: 'Cidade - UF',
    cnpj: '00.000.000/0001-00',
    cor: '#C41E3A',
  });
});
