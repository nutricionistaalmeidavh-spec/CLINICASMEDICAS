(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.PlennusDashboard = api;
    root.carregarDashboard = api.carregarDashboard;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function buildDashboardMetrics(data = {}, role) {
    const canSeeFinancial = role === 'admin' || role === 'recepcao';
    return {
      pacientes: Number(data.pacientes) || 0,
      consultasHoje: Number(data.consultasHoje) || 0,
      aguardando: Number(data.aguardando) || 0,
      pendencias: Number(data.pendencias) || 0,
      examesPendentes: Number(data.examesPendentes) || 0,
      proximos: Array.isArray(data.proximos) ? data.proximos : [],
      saldo: canSeeFinancial ? Number(data.saldo) || 0 : null
    };
  }

  function buildExecutiveMetrics(data = {}, role) {
    const canSeeFinancial = role === 'admin' || role === 'recepcao';
    const revenue = Number(data.receitaMes) || 0;
    const paidCount = Math.max(0, Number(data.receitasPagasMes) || 0);
    return {
      receitaMes: canSeeFinancial ? revenue : null,
      ticketMedio: canSeeFinancial && paidCount > 0 ? revenue / paidCount : canSeeFinancial ? 0 : null,
      inadimplencia: canSeeFinancial ? Number(data.inadimplencia) || 0 : null,
      repassesPendentes: role === 'admin' ? Number(data.repassesPendentes) || 0 : null,
      retornos: Number(data.retornos) || 0,
      tratamentosAtivos: Number(data.tratamentosAtivos) || 0,
      orcamentosPendentes: Number(data.orcamentosPendentes) || 0,
      estoqueCritico: canSeeFinancial ? Number(data.estoqueCritico) || 0 : null
    };
  }

  function emptyState(type) {
    const states = {
      espera: 'Nenhum paciente aguardando atendimento',
      exames: 'Nenhum exame pendente de revisão',
      agenda: 'Nenhum atendimento restante hoje',
      pendencias: 'Nenhuma pendência clínica aberta',
      retornos: 'Nenhum retorno pendente',
      orcamentos: 'Nenhum orçamento aguardando decisão',
      estoque: 'Nenhum item em estoque crítico'
    };
    return states[type] || 'Nenhum registro disponível';
  }

  function dashboardLayoutMarkup() {
    return `
      <div class="dashboard-heading-row">
        <div><h1 class="page-title" style="margin-bottom:4px">Visão geral</h1><p class="text-muted">Operação clínica, desempenho e itens que precisam de atenção.</p></div>
        <button class="btn btn-primary btn-sm dashboard-open-agenda" onclick="navegar('agenda')">Abrir agenda</button>
      </div>

      <div class="dashboard-section-label">Hoje</div>
      <div class="dashboard-kpi-grid">
        <div class="dashboard-kpi"><div class="dashboard-kpi-label">Pacientes ativos</div><div class="dashboard-kpi-value" id="stat-pacientes">0</div></div>
        <div class="dashboard-kpi"><div class="dashboard-kpi-label">Consultas hoje</div><div class="dashboard-kpi-value" id="stat-consultas">0</div></div>
        <div class="dashboard-kpi"><div class="dashboard-kpi-label">Em espera</div><div class="dashboard-kpi-value" id="stat-aguardando">0</div></div>
        <div class="dashboard-kpi"><div class="dashboard-kpi-label">Pendências clínicas</div><div class="dashboard-kpi-value" id="stat-pendencias">0</div></div>
        <div class="dashboard-kpi"><div class="dashboard-kpi-label">Exames para revisar</div><div class="dashboard-kpi-value" id="stat-exames-pendentes">0</div></div>
        <div class="dashboard-kpi dashboard-financial" id="dashboard-saldo-card"><div class="dashboard-kpi-label">Saldo caixa</div><div class="dashboard-kpi-value" id="stat-saldo">R$ 0,00</div></div>
      </div>

      <div class="dashboard-section-label">Gestão</div>
      <div class="dashboard-kpi-grid dashboard-executive-grid">
        <button type="button" class="dashboard-kpi dashboard-kpi-action dashboard-financial" id="dashboard-receita-card" onclick="navegar('financeiro')"><div class="dashboard-kpi-label">Receita recebida no mês</div><div class="dashboard-kpi-value" id="stat-receita-mes">R$ 0,00</div><small>Ver financeiro</small></button>
        <button type="button" class="dashboard-kpi dashboard-kpi-action dashboard-financial" id="dashboard-ticket-card" onclick="navegar('financeiro')"><div class="dashboard-kpi-label">Ticket médio recebido</div><div class="dashboard-kpi-value" id="stat-ticket-medio">R$ 0,00</div><small>Média por recebimento</small></button>
        <button type="button" class="dashboard-kpi dashboard-kpi-action dashboard-financial" id="dashboard-inadimplencia-card" onclick="navegar('financeiro')"><div class="dashboard-kpi-label">Recebíveis vencidos</div><div class="dashboard-kpi-value" id="stat-inadimplencia">R$ 0,00</div><small>Exige acompanhamento</small></button>
        <button type="button" class="dashboard-kpi dashboard-kpi-action" onclick="navegar('crm')"><div class="dashboard-kpi-label">Retornos pendentes</div><div class="dashboard-kpi-value" id="stat-retornos">0</div><small>CRM e acompanhamento</small></button>
        <button type="button" class="dashboard-kpi dashboard-kpi-action" onclick="navegar('odontologia')"><div class="dashboard-kpi-label">Tratamentos ativos</div><div class="dashboard-kpi-value" id="stat-tratamentos">0</div><small>Planos odontológicos</small></button>
        <button type="button" class="dashboard-kpi dashboard-kpi-action" onclick="navegar('odontologia')"><div class="dashboard-kpi-label">Orçamentos pendentes</div><div class="dashboard-kpi-value" id="stat-orcamentos">0</div><small>Aguardando decisão</small></button>
        <button type="button" class="dashboard-kpi dashboard-kpi-action dashboard-financial" id="dashboard-estoque-card" onclick="navegar('estoque')"><div class="dashboard-kpi-label">Estoque crítico</div><div class="dashboard-kpi-value" id="stat-estoque-critico">0</div><small>No mínimo ou abaixo</small></button>
        <button type="button" class="dashboard-kpi dashboard-kpi-action dashboard-admin-only" id="dashboard-repasses-card" onclick="navegar('repasses')"><div class="dashboard-kpi-label">Repasses pendentes</div><div class="dashboard-kpi-value" id="stat-repasses-pendentes">0</div><small>Profissionais a liquidar</small></button>
      </div>

      <div class="dashboard-grid">
        <section class="dashboard-panel"><h3>Próximos atendimentos</h3><div id="dashboard-proximos"></div></section>
        <section class="dashboard-panel"><h3>Sala de espera</h3><div id="dashboard-espera"></div></section>
        <section class="dashboard-panel"><h3>Revisão clínica</h3><div id="dashboard-clinico"></div></section>
        <section class="dashboard-panel"><h3>Retornos</h3><div id="dashboard-retornos"></div></section>
        <section class="dashboard-panel"><h3>Orçamentos odontológicos</h3><div id="dashboard-orcamentos"></div></section>
        <section class="dashboard-panel dashboard-financial"><h3>Estoque crítico</h3><div id="dashboard-estoque"></div></section>
      </div>`;
  }

  function ensureDashboardUi() {
    if (typeof document === 'undefined') return;
    const page = document.getElementById('page-dashboard');
    if (!page || page.dataset.platformDashboard === '1') return;
    page.dataset.platformDashboard = '1';
    page.innerHTML = dashboardLayoutMarkup();
  }

  function safeRows(sql, params = []) {
    try { return DB.query(sql, params); }
    catch (error) { console.warn('Dashboard: consulta indisponível nesta versão do schema.', error?.message || error); return []; }
  }

  function safeCount(sql, params = []) {
    const row = safeRows(sql, params)[0];
    return Number(row?.c) || 0;
  }

  function safeValue(sql, params = [], field = 'v') {
    const row = safeRows(sql, params)[0];
    return Number(row?.[field]) || 0;
  }

  function renderList(containerId, rows, emptyMessage, renderRow) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!rows.length) {
      container.innerHTML = `<div class="dashboard-empty">${emptyMessage}</div>`;
      return;
    }
    container.innerHTML = rows.map(renderRow).join('');
  }

  function esc(value) {
    return typeof escapeHTML === 'function' ? escapeHTML(value || '') : String(value || '');
  }

  function money(value) {
    return typeof formatMoney === 'function' ? formatMoney(Number(value) || 0) : String(Number(value) || 0);
  }

  function setRoleVisibility(role, executive) {
    const canSeeFinancial = role === 'admin' || role === 'recepcao';
    document.querySelectorAll('.dashboard-financial').forEach(el => { el.hidden = !canSeeFinancial; });
    document.querySelectorAll('.dashboard-admin-only').forEach(el => { el.hidden = role !== 'admin'; });
    if (executive.repassesPendentes === null) {
      const card = document.getElementById('dashboard-repasses-card');
      if (card) card.hidden = true;
    }
  }

  function carregarDashboard() {
    if (typeof DB === 'undefined' || !DB?.query) return;
    ensureDashboardUi();
    const dataHoje = typeof hoje === 'function' ? hoje() : '';
    const isoHoje = root.PlennusOperationsModel?.localIsoDate?.() || new Date().toISOString().slice(0, 10);
    const mes = isoHoje.slice(0, 7);
    const role = typeof currentUser !== 'undefined' ? currentUser?.nivel : null;

    const pacientes = safeCount('SELECT COUNT(*) as c FROM pacientes WHERE ativo=1');
    const consultasHoje = safeCount('SELECT COUNT(*) as c FROM agenda WHERE data=?', [dataHoje]);
    const aguardando = safeCount("SELECT COUNT(*) as c FROM agenda WHERE data=? AND status='espera'", [dataHoje]);
    const pendencias = safeCount("SELECT COUNT(*) as c FROM pendencias_clinicas WHERE status='aberta'");
    const examesPendentes = safeCount("SELECT COUNT(*) as c FROM exames_laboratoriais WHERE status_revisao='pendente'");
    const proximos = safeRows(`SELECT a.id,a.hora,a.status,p.nome as paciente,pr.nome as profissional
      FROM agenda a LEFT JOIN pacientes p ON p.id=a.paciente_id LEFT JOIN profissionais pr ON pr.id=a.profissional_id
      WHERE a.data=? AND a.status NOT IN ('cancelado','finalizado','realizado') ORDER BY a.hora LIMIT 6`, [dataHoje]);
    const saldo = safeValue("SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN valor ELSE -valor END),0) as v FROM caixa");

    const receitaMes = safeValue("SELECT COALESCE(SUM(valor),0) v FROM financeiro_lancamentos WHERE tipo='receita' AND status='pago' AND substr(COALESCE(pago_em,''),1,7)=?", [mes]);
    const receitasPagasMes = safeCount("SELECT COUNT(*) c FROM financeiro_lancamentos WHERE tipo='receita' AND status='pago' AND substr(COALESCE(pago_em,''),1,7)=?", [mes]);
    const inadimplencia = safeValue("SELECT COALESCE(SUM(valor),0) v FROM financeiro_lancamentos WHERE tipo='receita' AND status='pendente' AND vencimento_em IS NOT NULL AND vencimento_em<?", [isoHoje]);
    const repassesPendentes = safeCount("SELECT COUNT(*) c FROM repasses WHERE status='pendente'");
    const retornos = safeCount("SELECT COUNT(*) c FROM crm_pacientes WHERE etapa='retorno' OR (proximo_contato_em IS NOT NULL AND proximo_contato_em<=?)", [isoHoje]);
    const tratamentosAtivos = safeCount("SELECT COUNT(*) c FROM planos_tratamento WHERE status IN ('rascunho','proposto','aprovado','em_tratamento')");
    const orcamentosPendentes = safeCount("SELECT COUNT(*) c FROM orcamentos_odontologicos WHERE status IN ('rascunho','enviado','parcial')");
    const estoqueCritico = safeCount('SELECT COUNT(*) c FROM estoque_itens WHERE ativo=1 AND estoque_atual<=estoque_minimo');

    const metrics = buildDashboardMetrics({ pacientes, consultasHoje, aguardando, pendencias, examesPendentes, proximos, saldo }, role);
    const executive = buildExecutiveMetrics({ receitaMes, receitasPagasMes, inadimplencia, repassesPendentes, retornos, tratamentosAtivos, orcamentosPendentes, estoqueCritico }, role);

    const write = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    write('stat-pacientes', metrics.pacientes);
    write('stat-consultas', metrics.consultasHoje);
    write('stat-aguardando', metrics.aguardando);
    write('stat-pendencias', metrics.pendencias);
    write('stat-exames-pendentes', metrics.examesPendentes);
    if (metrics.saldo !== null) write('stat-saldo', money(metrics.saldo));
    if (executive.receitaMes !== null) write('stat-receita-mes', money(executive.receitaMes));
    if (executive.ticketMedio !== null) write('stat-ticket-medio', money(executive.ticketMedio));
    if (executive.inadimplencia !== null) write('stat-inadimplencia', money(executive.inadimplencia));
    if (executive.estoqueCritico !== null) write('stat-estoque-critico', executive.estoqueCritico);
    if (executive.repassesPendentes !== null) write('stat-repasses-pendentes', executive.repassesPendentes);
    write('stat-retornos', executive.retornos);
    write('stat-tratamentos', executive.tratamentosAtivos);
    write('stat-orcamentos', executive.orcamentosPendentes);
    setRoleVisibility(role, executive);

    renderList('dashboard-proximos', metrics.proximos, emptyState('agenda'), row => `
      <button class="dashboard-list-item" type="button" onclick="navegar('agenda')">
        <span class="dashboard-list-time">${esc(row.hora)}</span><span><strong>${esc(row.paciente || 'Paciente')}</strong><small>${esc(row.profissional)}</small></span>
      </button>`);

    const waitRows = safeRows(`SELECT a.id,a.hora,p.nome as paciente FROM agenda a LEFT JOIN pacientes p ON p.id=a.paciente_id
      WHERE a.data=? AND a.status='espera' ORDER BY COALESCE(a.chegada_em,a.hora) LIMIT 6`, [dataHoje]);
    renderList('dashboard-espera', waitRows, emptyState('espera'), row => `
      <button class="dashboard-list-item" type="button" onclick="navegar('agenda')"><span class="dashboard-list-time">${esc(row.hora)}</span><span><strong>${esc(row.paciente || 'Paciente')}</strong><small>Aguardando atendimento</small></span></button>`);

    const clinicalRows = safeRows(`SELECT e.id,p.nome as paciente,e.data_coleta as referencia
      FROM exames_laboratoriais e LEFT JOIN pacientes p ON p.id=e.paciente_id WHERE e.status_revisao='pendente'
      ORDER BY e.criado_em DESC LIMIT 5`);
    renderList('dashboard-clinico', clinicalRows, emptyState('exames'), row => `
      <button class="dashboard-list-item" type="button" onclick="navegar('prontuario')"><span class="dashboard-list-dot"></span><span><strong>${esc(row.paciente || 'Paciente')}</strong><small>Exame aguardando revisão</small></span></button>`);

    const returnRows = safeRows(`SELECT c.paciente_id,c.proximo_contato_em,p.nome paciente FROM crm_pacientes c
      JOIN pacientes p ON p.id=c.paciente_id WHERE c.etapa='retorno' OR (c.proximo_contato_em IS NOT NULL AND c.proximo_contato_em<=?)
      ORDER BY COALESCE(c.proximo_contato_em,'9999-12-31') LIMIT 5`, [isoHoje]);
    renderList('dashboard-retornos', returnRows, emptyState('retornos'), row => `
      <button class="dashboard-list-item" type="button" onclick="navegar('crm')"><span class="dashboard-list-dot"></span><span><strong>${esc(row.paciente)}</strong><small>${esc(row.proximo_contato_em || 'Retorno pendente')}</small></span></button>`);

    const budgetRows = safeRows(`SELECT o.id,o.status,o.valor_total,p.nome paciente FROM orcamentos_odontologicos o
      JOIN pacientes p ON p.id=o.paciente_id WHERE o.status IN ('rascunho','enviado','parcial') ORDER BY o.atualizado_em DESC LIMIT 5`);
    renderList('dashboard-orcamentos', budgetRows, emptyState('orcamentos'), row => `
      <button class="dashboard-list-item" type="button" onclick="navegar('odontologia')"><span class="dashboard-list-dot"></span><span><strong>${esc(row.paciente)}</strong><small>${esc(row.status)} • ${money(row.valor_total)}</small></span></button>`);

    const stockRows = safeRows(`SELECT nome,estoque_atual,estoque_minimo,unidade FROM estoque_itens
      WHERE ativo=1 AND estoque_atual<=estoque_minimo ORDER BY (estoque_atual-estoque_minimo),nome LIMIT 5`);
    renderList('dashboard-estoque', stockRows, emptyState('estoque'), row => `
      <button class="dashboard-list-item" type="button" onclick="navegar('estoque')"><span class="dashboard-list-dot"></span><span><strong>${esc(row.nome)}</strong><small>${Number(row.estoque_atual || 0)} ${esc(row.unidade || 'un')} • mínimo ${Number(row.estoque_minimo || 0)}</small></span></button>`);
  }

  return { buildDashboardMetrics, buildExecutiveMetrics, emptyState, dashboardLayoutMarkup, ensureDashboardUi, carregarDashboard };
});
