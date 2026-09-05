const test = require('node:test');
const assert = require('node:assert/strict');
const dashboard = require('../js/domains/dashboard');

test('builds operational dashboard metrics and hides finance from medico', () => {
  const data = {
    pacientes: 10,
    consultasHoje: 4,
    aguardando: 2,
    pendencias: 3,
    examesPendentes: 1,
    proximos: [{ id: 1 }],
    saldo: 150.5
  };
  const admin = dashboard.buildDashboardMetrics(data, 'admin');
  const medico = dashboard.buildDashboardMetrics(data, 'medico');
  const recepcao = dashboard.buildDashboardMetrics(data, 'recepcao');
  assert.equal(admin.saldo, 150.5);
  assert.equal(recepcao.saldo, 150.5);
  assert.equal(medico.saldo, null);
  assert.equal(medico.aguardando, 2);
  assert.equal(medico.examesPendentes, 1);
});

test('dashboard empty-state helper returns explicit operational copy', () => {
  assert.equal(dashboard.emptyState('espera'), 'Nenhum paciente aguardando atendimento');
  assert.equal(dashboard.emptyState('exames'), 'Nenhum exame pendente de revisão');
  assert.equal(dashboard.emptyState('agenda'), 'Nenhum atendimento restante hoje');
});
