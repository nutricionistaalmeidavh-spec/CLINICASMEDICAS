const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/core/clinical-model.js');

test('vital series is chronological and ignores missing values', () => {
  const series = model.buildVitalSeries([
    { data_hora: '2026-09-05 10:00', peso: 80, imc: 25, temperatura: 36.5 },
    { data_hora: '2026-09-01 10:00', peso: 81, imc: null, temperatura: null }
  ]);
  assert.deepEqual(series.peso.map(x => x.value), [81, 80]);
  assert.deepEqual(series.imc.map(x => x.value), [25]);
  assert.deepEqual(series.temperatura.map(x => x.value), [36.5]);
});
