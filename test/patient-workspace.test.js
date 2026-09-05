const test = require('node:test');
const assert = require('node:assert/strict');
const workspace = require('../js/domains/patient-workspace.js');

test('workspace exposes the approved patient-centered tabs', () => {
  assert.deepEqual(workspace.TABS.map(x => x.id), [
    'resumo','pep','exames','evolucao','arquivos','documentos','consentimentos','pendencias'
  ]);
});

test('workspace normalizes invalid tab to resumo', () => {
  assert.equal(workspace.normalizeTab('exames'), 'exames');
  assert.equal(workspace.normalizeTab('inexistente'), 'resumo');
});
