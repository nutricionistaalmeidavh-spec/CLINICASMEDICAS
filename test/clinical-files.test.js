const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/core/clinical-model.js');

test('clinical file metadata accepts a complete record', () => {
  assert.deepEqual(model.validateClinicalFileMetadata({
    paciente_id: 2,
    categoria: 'Imagem clínica',
    nome_arquivo: 'lesao-2026-09-05.jpg',
    caminho_arquivo: '/tmp/lesao.jpg'
  }), []);
});

test('clinical file metadata rejects missing patient, category and file name', () => {
  const errors = model.validateClinicalFileMetadata({ paciente_id: null, categoria: '', nome_arquivo: '' });
  assert.ok(errors.includes('paciente_id'));
  assert.ok(errors.includes('categoria'));
  assert.ok(errors.includes('nome_arquivo'));
});
