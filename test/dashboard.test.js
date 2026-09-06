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

test('builds executive indicators with deterministic ticket and restricted financial data', () => {
  const data = {
    receitaMes: 1200,
    receitasPagasMes: 4,
    inadimplencia: 350,
    repassesPendentes: 2,
    retornos: 5,
    tratamentosAtivos: 7,
    orcamentosPendentes: 3,
    estoqueCritico: 4
  };

  const admin = dashboard.buildExecutiveMetrics(data, 'admin');
  assert.equal(admin.receitaMes, 1200);
  assert.equal(admin.ticketMedio, 300);
  assert.equal(admin.inadimplencia, 350);
  assert.equal(admin.repassesPendentes, 2);
  assert.equal(admin.retornos, 5);
  assert.equal(admin.tratamentosAtivos, 7);
  assert.equal(admin.orcamentosPendentes, 3);
  assert.equal(admin.estoqueCritico, 4);

  const recepcao = dashboard.buildExecutiveMetrics(data, 'recepcao');
  assert.equal(recepcao.receitaMes, 1200);
  assert.equal(recepcao.repassesPendentes, null);

  const medico = dashboard.buildExecutiveMetrics(data, 'medico');
  assert.equal(medico.receitaMes, null);
  assert.equal(medico.ticketMedio, null);
  assert.equal(medico.inadimplencia, null);
  assert.equal(medico.estoqueCritico, null);
  assert.equal(medico.tratamentosAtivos, 7);
});

test('ticket average stays zero when there are no paid receipts', () => {
  const metrics = dashboard.buildExecutiveMetrics({ receitaMes: 0, receitasPagasMes: 0 }, 'admin');
  assert.equal(metrics.ticketMedio, 0);
});

test('dashboard empty-state helper returns explicit operational copy', () => {
  assert.equal(dashboard.emptyState('espera'), 'Nenhum paciente aguardando atendimento');
  assert.equal(dashboard.emptyState('exames'), 'Nenhum exame pendente de revisão');
  assert.equal(dashboard.emptyState('agenda'), 'Nenhum atendimento restante hoje');
  assert.equal(dashboard.emptyState('retornos'), 'Nenhum retorno pendente');
  assert.equal(dashboard.emptyState('orcamentos'), 'Nenhum orçamento aguardando decisão');
  assert.equal(dashboard.emptyState('estoque'), 'Nenhum item em estoque crítico');
});
