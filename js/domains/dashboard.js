(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.PlennusDashboard = api;
    root.carregarDashboard = api.carregarDashboard;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function buildDashboardMetrics(data = {}, role) {
    const canSeeBalance = role === 'admin' || role === 'recepcao';
    return {
      pacientes: Number(data.pacientes) || 0,
      consultasHoje: Number(data.consultasHoje) || 0,
      aguardando: Number(data.aguardando) || 0,
      pendencias: Number(data.pendencias) || 0,
      examesPendentes: Number(data.examesPendentes) || 0,
      proximos: Array.isArray(data.proximos) ? data.proximos : [],
      saldo: canSeeBalance ? Number(data.saldo) || 0 : null
    };
  }

  function emptyState(type) {
    const states = {
      espera: 'Nenhum paciente aguardando atendimento',
      exames: 'Nenhum exame pendente de revisão',
      agenda: 'Nenhum atendimento restante hoje',
      pendencias: 'Nenhuma pendência clínica aberta'
    };
    return states[type] || 'Nenhum registro disponível';
  }

  function dashboardLayoutMarkup() {
    return `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:18px">
        <div><h1 class="page-title" style="margin-bottom:4px">Visão geral</h1><p class="text-muted">Operação clínica de hoje e itens que precisam de atenção.</p></div>
        <button class="btn btn-primary btn-sm" style="width:auto" onclick="navegar('agenda')">Abrir agenda</button>
      </div>
      <div class="dashboard-kpi-grid">
        <div class="dashboard-kpi"><div class="dashboard-kpi-label">Pacientes ativos</div><div class="dashboard-kpi-value" id="stat-pacientes">0</div></div>
        <div class="dashboard-kpi"><div class="dashboard-kpi-label">Consultas hoje</div><div class="dashboard-kpi-value" id="stat-consultas">0</div></div>
        <div class="dashboard-kpi"><div class="dashboard-kpi-label">Em espera</div><div class="dashboard-kpi-value" id="stat-aguardando">0</div></div>
        <div class="dashboard-kpi"><div class="dashboard-kpi-label">Pendências clínicas</div><div class="dashboard-kpi-value" id="stat-pendencias">0</div></div>
        <div class="dashboard-kpi"><div class="dashboard-kpi-label">Exames para revisar</div><div class="dashboard-kpi-value" id="stat-exames-pendentes">0</div></div>
        <div class="dashboard-kpi" id="dashboard-saldo-card"><div class="dashboard-kpi-label">Saldo caixa</div><div class="dashboard-kpi-value" id="stat-saldo">R$ 0,00</div></div>
      </div>
      <div class="dashboard-grid">
        <section class="dashboard-panel"><h3>Próximos atendimentos</h3><div id="dashboard-proximos"></div></section>
        <section class="dashboard-panel"><h3>Sala de espera</h3><div id="dashboard-espera"></div></section>
        <section class="dashboard-panel"><h3>Revisão clínica</h3><div id="dashboard-clinico"></div></section>
      </div>`;
  }

  function ensureDashboardUi() {
    if (typeof document === 'undefined') return;
    const page = document.getElementById('page-dashboard');
    if (!page || page.dataset.platformDashboard === '1') return;
    page.dataset.platformDashboard = '1';
    page.innerHTML = dashboardLayoutMarkup();
  }

  function safeCount(sql, params = []) {
    const row = DB.query(sql, params)[0];
    return Number(row?.c) || 0;
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

  function carregarDashboard() {
    if (typeof DB === 'undefined' || !DB?.query) return;
    ensureDashboardUi();
    const dataHoje = typeof hoje === 'function' ? hoje() : '';
    const role = typeof currentUser !== 'undefined' ? currentUser?.nivel : null;
    const pacientes = safeCount('SELECT COUNT(*) as c FROM pacientes WHERE ativo=1');
    const consultasHoje = safeCount('SELECT COUNT(*) as c FROM agenda WHERE data=?', [dataHoje]);
    const aguardando = safeCount("SELECT COUNT(*) as c FROM agenda WHERE data=? AND status='espera'", [dataHoje]);
    const pendencias = safeCount("SELECT COUNT(*) as c FROM pendencias_clinicas WHERE status='aberta'");
    const examesPendentes = safeCount("SELECT COUNT(*) as c FROM exames_laboratoriais WHERE status_revisao='pendente'");
    const proximos = DB.query(`SELECT a.id,a.hora,a.status,p.nome as paciente,pr.nome as profissional
      FROM agenda a LEFT JOIN pacientes p ON p.id=a.paciente_id LEFT JOIN profissionais pr ON pr.id=a.profissional_id
      WHERE a.data=? AND a.status NOT IN ('cancelado','finalizado') ORDER BY a.hora LIMIT 6`, [dataHoje]);
    const saldo = DB.query(`SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN valor ELSE -valor END),0) as s FROM caixa`)[0]?.s || 0;
    const metrics = buildDashboardMetrics({ pacientes, consultasHoje, aguardando, pendencias, examesPendentes, proximos, saldo }, role);

    const write = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    write('stat-pacientes', metrics.pacientes);
    write('stat-consultas', metrics.consultasHoje);
    write('stat-aguardando', metrics.aguardando);
    write('stat-pendencias', metrics.pendencias);
    write('stat-exames-pendentes', metrics.examesPendentes);
    const saldoCard = document.getElementById('dashboard-saldo-card');
    if (saldoCard) saldoCard.hidden = metrics.saldo === null;
    if (metrics.saldo !== null) write('stat-saldo', typeof formatMoney === 'function' ? formatMoney(metrics.saldo) : String(metrics.saldo));

    renderList('dashboard-proximos', metrics.proximos, emptyState('agenda'), row => `
      <button class="dashboard-list-item" type="button" onclick="navegar('agenda')">
        <span class="dashboard-list-time">${esc(row.hora)}</span><span><strong>${esc(row.paciente || 'Paciente')}</strong><small>${esc(row.profissional)}</small></span>
      </button>`);

    const waitRows = DB.query(`SELECT a.id,a.hora,p.nome as paciente FROM agenda a LEFT JOIN pacientes p ON p.id=a.paciente_id
      WHERE a.data=? AND a.status='espera' ORDER BY COALESCE(a.chegada_em,a.hora) LIMIT 6`, [dataHoje]);
    renderList('dashboard-espera', waitRows, emptyState('espera'), row => `
      <button class="dashboard-list-item" type="button" onclick="navegar('agenda')"><span class="dashboard-list-time">${esc(row.hora)}</span><span><strong>${esc(row.paciente || 'Paciente')}</strong><small>Aguardando atendimento</small></span></button>`);

    const clinicalRows = DB.query(`SELECT e.id,p.nome as paciente,e.data_coleta as referencia
      FROM exames_laboratoriais e LEFT JOIN pacientes p ON p.id=e.paciente_id WHERE e.status_revisao='pendente'
      ORDER BY e.criado_em DESC LIMIT 5`);
    renderList('dashboard-clinico', clinicalRows, emptyState('exames'), row => `
      <button class="dashboard-list-item" type="button" onclick="navegar('prontuario')"><span class="dashboard-list-dot"></span><span><strong>${esc(row.paciente || 'Paciente')}</strong><small>Exame aguardando revisão</small></span></button>`);
  }

  return { buildDashboardMetrics, emptyState, dashboardLayoutMarkup, ensureDashboardUi, carregarDashboard };
});
