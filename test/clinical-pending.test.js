const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/core/clinical-model.js');

test('derived pending items do not duplicate manual rows or repeated reads', () => {
  const input = {
    labs: [{ id: 7, status_revisao: 'pendente', data_coleta: '2026-09-05' }],
    encounters: [{ id: 3, finalizado: 1, data_hora: '2026-09-04 09:00' }],
    futureAppointments: [],
    manualItems: [{ id: 10, tipo: 'manual', titulo: 'Ligar para paciente', status: 'aberta' }]
  };
  const first = model.derivePendingItems(input);
  const second = model.derivePendingItems(input);
  assert.deepEqual(first.map(x => x.key), second.map(x => x.key));
  assert.equal(new Set(first.map(x => x.key)).size, first.length);
  assert.ok(first.some(x => x.key === 'manual:10'));
});

test('future appointment suppresses follow-up pending item', () => {
  const items = model.derivePendingItems({
    labs: [],
    encounters: [{ id: 3, paciente_id: 1, finalizado: 1, data_hora: '2026-09-04 09:00' }],
    futureAppointments: [{ id: 9, paciente_id: 1, data: '2026-09-10', status: 'agendado' }],
    manualItems: []
  });
  assert.equal(items.some(x => x.key === 'followup:3'), false);
});
