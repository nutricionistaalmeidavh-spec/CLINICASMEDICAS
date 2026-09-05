const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/core/clinical-model.js');

test('numeric laboratory result is low, normal or high only with numeric references', () => {
  assert.equal(model.labResultStatus({ valor: 70, referencia_min: 70, referencia_max: 99 }), 'normal');
  assert.equal(model.labResultStatus({ valor: 50, referencia_min: 70, referencia_max: 99 }), 'baixo');
  assert.equal(model.labResultStatus({ valor: 120, referencia_min: 70, referencia_max: 99 }), 'alto');
});

test('laboratory text result has no automatic classification', () => {
  assert.equal(model.labResultStatus({ valor_texto: 'Não reagente', referencia_texto: 'Não reagente' }), 'sem_classificacao');
});
