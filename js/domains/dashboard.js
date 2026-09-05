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

  function carregarDashboard() {
    if (typeof DB === 'undefined' || !DB?.query) return;
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
        <span class="dashboard-list-time">${typeof escapeHTML === 'function' ? escapeHTML(row.hora || '') : row.hora || ''}</span>
        <span><strong>${typeof escapeHTML === 'function' ? escapeHTML(row.paciente || 'Paciente') : row.paciente || 'Paciente'}</strong><small>${typeof escapeHTML === 'function' ? escapeHTML(row.profissional || '') : row.profissional || ''}</small></span>
      </button>`);

    const waitRows = DB.query(`SELECT a.id,a.hora,p.nome as paciente FROM agenda a LEFT JOIN pacientes p ON p.id=a.paciente_id
      WHERE a.data=? AND a.status='espera' ORDER BY COALESCE(a.chegada_em,a.hora) LIMIT 6`, [dataHoje]);
    renderList('dashboard-espera', waitRows, emptyState('espera'), row => `
      <button class="dashboard-list-item" type="button" onclick="navegar('agenda')"><span class="dashboard-list-time">${typeof escapeHTML === 'function' ? escapeHTML(row.hora || '') : row.hora || ''}</span><span><strong>${typeof escapeHTML === 'function' ? escapeHTML(row.paciente || 'Paciente') : row.paciente || 'Paciente'}</strong><small>Aguardando atendimento</small></span></button>`);

    const clinicalRows = DB.query(`SELECT 'exame' as tipo,e.id,p.nome as paciente,e.data_coleta as referencia
      FROM exames_laboratoriais e LEFT JOIN pacientes p ON p.id=e.paciente_id WHERE e.status_revisao='pendente'
      ORDER BY e.criado_em DESC LIMIT 5`);
    renderList('dashboard-clinico', clinicalRows, emptyState('exames'), row => `
      <button class="dashboard-list-item" type="button" onclick="navegar('prontuario')"><span class="dashboard-list-dot"></span><span><strong>${typeof escapeHTML === 'function' ? escapeHTML(row.paciente || 'Paciente') : row.paciente || 'Paciente'}</strong><small>Exame aguardando revisão</small></span></button>`);
  }

  return { buildDashboardMetrics, emptyState, carregarDashboard };
});
