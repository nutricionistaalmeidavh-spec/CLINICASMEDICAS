const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/core/clinical-model.js');

test('consentStatus distinguishes active, revoked and absent consent', () => {
  assert.equal(model.consentStatus({ autorizado: 1, revogado_em: null }), 'autorizado');
  assert.equal(model.consentStatus({ autorizado: 1, revogado_em: '2026-09-05' }), 'revogado');
  assert.equal(model.consentStatus(null), 'nao_autorizado');
});

test('labResultStatus only classifies numeric values when numeric limits exist', () => {
  assert.equal(model.labResultStatus({ valor: 2, referencia_min: 3, referencia_max: 5 }), 'baixo');
  assert.equal(model.labResultStatus({ valor: 4, referencia_min: 3, referencia_max: 5 }), 'normal');
  assert.equal(model.labResultStatus({ valor: 7, referencia_min: 3, referencia_max: 5 }), 'alto');
  assert.equal(model.labResultStatus({ valor_texto: 'Negativo' }), 'sem_classificacao');
});

test('buildVitalSeries orders measurements chronologically and omits absent values', () => {
  const series = model.buildVitalSeries([
    { data_hora: '2026-09-05 10:00', peso: 80, imc: 25 },
    { data_hora: '2026-09-01 10:00', peso: 81, imc: null }
  ]);
  assert.deepEqual(series.peso.map(x => x.value), [81, 80]);
  assert.deepEqual(series.imc.map(x => x.value), [25]);
});

test('clinical file metadata requires patient, category and file name', () => {
  assert.deepEqual(model.validateClinicalFileMetadata({ paciente_id: 1, categoria: 'Imagem', nome_arquivo: 'foto.jpg' }), []);
  assert.ok(model.validateClinicalFileMetadata({ paciente_id: 1, categoria: '', nome_arquivo: '' }).length >= 2);
});

test('derived pending items are stable and deduplicated', () => {
  const input = {
    labs: [{ id: 7, status_revisao: 'pendente', data_coleta: '2026-09-05' }],
    encounters: [{ id: 3, finalizado: 1, data_hora: '2026-09-04 09:00' }],
    futureAppointments: [],
    manualItems: []
  };
  const first = model.derivePendingItems(input);
  const second = model.derivePendingItems(input);
  assert.deepEqual(first.map(x => x.key), second.map(x => x.key));
  assert.equal(new Set(first.map(x => x.key)).size, first.length);
  assert.ok(first.some(x => x.key === 'lab:7'));
  assert.ok(first.some(x => x.key === 'followup:3'));
});
