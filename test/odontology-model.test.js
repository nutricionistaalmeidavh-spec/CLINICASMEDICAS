const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/core/odontology-model');

test('accepts FDI permanent and deciduous teeth and rejects invalid numbers', () => {
  for (const tooth of [11, 18, 21, 28, 31, 38, 41, 48, 51, 55, 61, 65, 71, 75, 81, 85]) {
    assert.equal(model.isValidFdiTooth(tooth), true, `tooth ${tooth} should be valid`);
  }
  for (const tooth of [10, 19, 29, 39, 49, 56, 66, 76, 86, 99]) {
    assert.equal(model.isValidFdiTooth(tooth), false, `tooth ${tooth} should be invalid`);
  }
});

test('normalizes dental surfaces using the clinical vocabulary', () => {
  assert.equal(model.normalizeSurface('V'), 'vestibular');
  assert.equal(model.normalizeSurface('oclusal'), 'oclusal');
  assert.equal(model.normalizeSurface('palatina'), 'palatina');
  assert.equal(model.normalizeSurface(''), null);
  assert.throws(() => model.normalizeSurface('superior'), /Face dental inválida/);
});

test('calculates treatment item totals without allowing negative discounts', () => {
  assert.equal(model.calculateTreatmentItemTotal({ quantity: 2, unitPrice: 150, discount: 20 }), 280);
  assert.equal(model.calculateTreatmentItemTotal({ quantity: 1, unitPrice: '199,99', discount: 0 }), 199.99);
  assert.equal(model.calculateTreatmentItemTotal({ quantity: 1, unitPrice: 100, discount: 150 }), 0);
  assert.throws(() => model.calculateTreatmentItemTotal({ quantity: 0, unitPrice: 100, discount: 0 }), /Quantidade/);
});

test('derives budget status from item decisions', () => {
  assert.equal(model.deriveBudgetStatus(['pendente', 'pendente']), 'enviado');
  assert.equal(model.deriveBudgetStatus(['aprovado', 'aprovado']), 'aprovado');
  assert.equal(model.deriveBudgetStatus(['aprovado', 'recusado']), 'parcial');
  assert.equal(model.deriveBudgetStatus(['recusado', 'recusado']), 'recusado');
});

test('treatment plan is complete only when every active item is realized or cancelled', () => {
  assert.equal(model.isTreatmentPlanComplete(['realizado', 'realizado']), true);
  assert.equal(model.isTreatmentPlanComplete(['realizado', 'cancelado']), true);
  assert.equal(model.isTreatmentPlanComplete(['realizado', 'agendado']), false);
  assert.equal(model.isTreatmentPlanComplete([]), false);
});
