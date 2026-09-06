const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/core/operations-model');

test('calculates professional payout with currency rounding and bounded percentage', () => {
  assert.equal(model.calculatePayout(350, 30), 105);
  assert.equal(model.calculatePayout('199,99', 25), 50);
  assert.equal(model.calculatePayout(100, 150), 100);
  assert.equal(model.calculatePayout(-50, 30), 0);
});

test('stock movement prevents negative stock and supports adjustments', () => {
  assert.deepEqual(model.computeStockMovement({ type: 'entrada', current: 5, quantity: 2.5 }), {
    before: 5, after: 7.5, delta: 2.5, quantity: 2.5
  });
  assert.deepEqual(model.computeStockMovement({ type: 'saida', current: 5, quantity: 2 }), {
    before: 5, after: 3, delta: -2, quantity: 2
  });
  assert.deepEqual(model.computeStockMovement({ type: 'ajuste', current: 5, quantity: 3 }), {
    before: 5, after: 3, delta: -2, quantity: 3
  });
  assert.throws(() => model.computeStockMovement({ type: 'saida', current: 1, quantity: 2 }), /Estoque insuficiente/);
});

test('financial status distinguishes paid, cancelled, overdue and pending entries', () => {
  const today = '2026-09-06';
  assert.equal(model.classifyFinancialStatus({ status: 'pago', vencimento_em: '2026-09-01' }, today), 'pago');
  assert.equal(model.classifyFinancialStatus({ status: 'cancelado', vencimento_em: '2026-09-01' }, today), 'cancelado');
  assert.equal(model.classifyFinancialStatus({ status: 'pendente', vencimento_em: '2026-09-01' }, today), 'atrasado');
  assert.equal(model.classifyFinancialStatus({ status: 'pendente', vencimento_em: '2026-09-06' }, today), 'pendente');
});

test('date helpers keep Brazilian and ISO clinical dates deterministic', () => {
  assert.equal(model.brDateToIso('06/09/2026'), '2026-09-06');
  assert.equal(model.isoDateToBr('2026-09-06'), '06/09/2026');
  assert.equal(model.appointmentDateTimeIso('06/09/2026', '14:30'), '2026-09-06T14:30:00');
  assert.equal(model.addDaysIso('2026-09-06', 30), '2026-10-06');
  assert.equal(model.daysBetweenIso('2026-03-01', '2026-09-06'), 189);
});

test('patient inactivity is derived without mutating clinical data', () => {
  assert.equal(model.isPatientInactive('2026-08-01', '2026-09-06', 180), false);
  assert.equal(model.isPatientInactive('2026-01-01', '2026-09-06', 180), true);
  assert.equal(model.isPatientInactive('', '2026-09-06', 180), true);
});

test('WhatsApp templates and dedupe keys are stable by origin', () => {
  const confirmation = model.buildWhatsappMessage('confirmacao', {
    paciente: 'Maria', clinica: 'Plennus Clinic', profissional: 'Dra. Ana', data: '06/09/2026', hora: '14:30'
  });
  assert.match(confirmation, /Maria/);
  assert.match(confirmation, /Plennus Clinic/);
  assert.match(confirmation, /06\/09\/2026/);
  assert.equal(model.whatsappDedupeKey('lembrete', 'agenda', 42), 'lembrete:agenda:42');
  assert.equal(model.whatsappScheduledDedupeKey('retorno', 'crm_paciente', 42, '2026-10-06'), 'retorno:crm_paciente:42:2026-10-06');
  assert.notEqual(
    model.whatsappScheduledDedupeKey('retorno', 'crm_paciente', 42, '2026-10-06'),
    model.whatsappScheduledDedupeKey('retorno', 'crm_paciente', 42, '2026-11-06')
  );
  assert.throws(() => model.whatsappDedupeKey('desconhecido', 'agenda', 42), /inválido/);
  assert.throws(() => model.whatsappScheduledDedupeKey('retorno', 'crm_paciente', 42, ''), /obrigatória/);
});
