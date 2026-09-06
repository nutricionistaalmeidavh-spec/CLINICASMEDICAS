(function (root) {
  const model = root.PlennusOperationsModel;
  let selectedPatientId = null;

  function canAccess() {
    const role = typeof currentUser !== 'undefined' ? currentUser?.nivel : null;
    return role === 'admin' || role === 'recepcao';
  }

  function ensureMenuItem() {
    const menu = document.getElementById('sidebar-menu');
    if (!menu || menu.querySelector('[data-page="crm"]')) return;
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.dataset.page = 'crm';
    item.dataset.roles = 'admin,recepcao';
    item.textContent = '◎  CRM pacientes';
    const before = menu.querySelector('[data-page="configuracoes"]');
    if (before) menu.insertBefore(item, before); else menu.appendChild(item);
  }

  function ensureCrmUi() {
    ensureMenuItem();
    const main = document.querySelector('.main-content');
    if (!main || document.getElementById('page-crm')) return;
    const page = document.createElement('div');
    page.className = 'page';
    page.id = 'page-crm';
    page.innerHTML = `
      <div class="page-heading-row"><div><h1 class="page-title">CRM de pacientes</h1><p class="text-muted">Retornos, pacientes inativos, histórico de contato e oportunidades de tratamento.</p></div></div>
      <div class="operations-kpi-grid" id="crm-kpis"></div>
      <div class="card">
        <div class="operations-toolbar">
          <div class="card-title" style="margin:0">Jornada dos pacientes</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="crm-busca" type="search" placeholder="Buscar paciente" style="min-width:220px">
            <select id="crm-filtro-etapa"><option value="">Todas as etapas</option><option value="novo">Novo</option><option value="agendado">Agendado</option><option value="acompanhamento">Acompanhamento</option><option value="retorno">Retorno</option><option value="inativo">Inativo</option></select>
          </div>
        </div>
        <div class="table-wrapper"><table><thead><tr><th>Paciente</th><th>Etapa</th><th>Último atendimento</th><th>Próxima consulta</th><th>Próximo contato</th><th>Última interação</th><th>Ações</th></tr></thead><tbody id="crm-pacientes-tabela"></tbody></table></div>
      </div>
      <div class="operations-grid-2">
        <div class="card">
          <div class="card-title">Registrar interação</div>
          <div class="form-row">
            <div class="form-group" style="flex:2"><label>Paciente</label><select id="crm-int-paciente"></select></div>
            <div class="form-group"><label>Tipo</label><select id="crm-int-tipo"><option value="whatsapp">WhatsApp</option><option value="ligacao">Ligação</option><option value="nota">Nota</option><option value="retorno">Retorno</option><option value="orcamento">Orçamento</option><option value="cobranca">Cobrança</option></select></div>
          </div>
          <div class="form-row"><div class="form-group" style="flex:2"><label>Descrição *</label><textarea id="crm-int-descricao" rows="3"></textarea></div></div>
          <div class="form-row">
            <div class="form-group"><label>Resultado</label><input id="crm-int-resultado" type="text"></div>
            <div class="form-group"><label>Próxima ação</label><input id="crm-int-proxima" type="date"></div>
            <div class="form-group"><label>Nova etapa</label><select id="crm-int-etapa"><option value="">Manter</option><option value="novo">Novo</option><option value="agendado">Agendado</option><option value="acompanhamento">Acompanhamento</option><option value="retorno">Retorno</option><option value="inativo">Inativo</option></select></div>
          </div>
          <div class="form-actions"><button class="btn btn-primary btn-sm" id="crm-int-salvar">Registrar interação</button></div>
          <div id="crm-historico" class="operations-history"></div>
        </div>
        <div class="card">
          <div class="card-title">Oportunidade / tratamento</div>
          <div class="form-row"><div class="form-group" style="flex:2"><label>Paciente</label><select id="crm-op-paciente"></select></div><div class="form-group"><label>Tipo</label><select id="crm-op-tipo"><option value="tratamento">Tratamento</option><option value="orcamento">Orçamento</option><option value="retorno">Retorno</option><option value="outro">Outro</option></select></div></div>
          <div class="form-row"><div class="form-group" style="flex:2"><label>Título *</label><input id="crm-op-titulo" type="text"></div><div class="form-group"><label>Valor estimado</label><input id="crm-op-valor" type="number" min="0" step="0.01"></div></div>
          <div class="form-row"><div class="form-group"><label>Etapa</label><select id="crm-op-etapa"><option value="aberta">Aberta</option><option value="proposta">Proposta</option><option value="aguardando">Aguardando paciente</option><option value="ganha">Ganha</option><option value="perdida">Perdida</option></select></div><div class="form-group"><label>Próxima ação</label><input id="crm-op-proxima" type="date"></div></div>
          <div class="form-row"><div class="form-group" style="flex:2"><label>Observação</label><input id="crm-op-observacao" type="text"></div></div>
          <div class="form-actions"><button class="btn btn-primary btn-sm" id="crm-op-salvar">Salvar oportunidade</button></div>
          <div class="table-wrapper" style="margin-top:12px"><table><thead><tr><th>Paciente</th><th>Oportunidade</th><th>Valor</th><th>Etapa</th><th>Próxima ação</th><th></th></tr></thead><tbody id="crm-op-tabela"></tbody></table></div>
        </div>
      </div>`;
    main.appendChild(page);
    page.querySelector('#crm-busca').addEventListener('input', carregarPacientesCrm);
    page.querySelector('#crm-filtro-etapa').addEventListener('change', carregarPacientesCrm);
    page.querySelector('#crm-int-salvar').addEventListener('click', registrarInteracao);
    page.querySelector('#crm-int-paciente').addEventListener('change', event => selecionarPacienteCrm(event.target.value));
    page.querySelector('#crm-op-salvar').addEventListener('click', registrarOportunidade);
  }

  function ensurePatientRecord(patientId) {
    if (!patientId) return;
    DB.run(`INSERT OR IGNORE INTO crm_pacientes (paciente_id,etapa) VALUES (?, 'novo')`, [patientId]);
  }

  function patientAttendanceDates(patientId) {
    const rows = DB.query("SELECT data,status FROM agenda WHERE paciente_id=? AND status IN ('realizado','agendado','confirmado','espera','atendimento')", [patientId]);
    const realized = rows.filter(row => row.status === 'realizado').map(row => model.brDateToIso(row.data)).filter(Boolean).sort();
    const future = rows.filter(row => row.status !== 'realizado').map(row => model.brDateToIso(row.data)).filter(Boolean).filter(date => date >= model.localIsoDate()).sort();
    return { last: realized.at(-1) || '', next: future[0] || '' };
  }

  function patientDerivedInactive(patient, lastAttendance) {
    const created = String(patient.criado_em || '').slice(0, 10);
    return model.isPatientInactive(lastAttendance || created, model.localIsoDate(), 180);
  }

  function registrarInteracao() {
    if (!canAccess()) return alert('Acesso ao CRM não autorizado.');
    const patientId = document.getElementById('crm-int-paciente').value;
    const description = document.getElementById('crm-int-descricao').value.trim();
    if (!patientId || !description) return alert('Selecione o paciente e informe a descrição.');
    const next = document.getElementById('crm-int-proxima').value || null;
    ensurePatientRecord(patientId);
    DB.run(`INSERT INTO crm_interacoes (paciente_id,tipo,direcao,descricao,resultado,proxima_acao_em,usuario_id) VALUES (?,?,?,?,?,?,?)`, [
      patientId, document.getElementById('crm-int-tipo').value, 'saida', description,
      document.getElementById('crm-int-resultado').value.trim() || null, next,
      typeof currentUser !== 'undefined' ? currentUser?.id || null : null
    ]);
    const newStage = document.getElementById('crm-int-etapa').value;
    DB.run(`UPDATE crm_pacientes SET proximo_contato_em=?,etapa=COALESCE(NULLIF(?,''),etapa),atualizado_em=datetime('now','localtime') WHERE paciente_id=?`, [next, newStage, patientId]);
    document.getElementById('crm-int-descricao').value = '';
    document.getElementById('crm-int-resultado').value = '';
    document.getElementById('crm-int-proxima').value = '';
    document.getElementById('crm-int-etapa').value = '';
    root.PlennusWhatsAppAutomation?.syncCrmPatientMessages(patientId);
    carregarCRM();
    selecionarPacienteCrm(patientId);
  }

  function selecionarPacienteCrm(patientId) {
    selectedPatientId = Number(patientId) || null;
    if (selectedPatientId) {
      const interactionSelect = document.getElementById('crm-int-paciente');
      const opportunitySelect = document.getElementById('crm-op-paciente');
      if (interactionSelect) interactionSelect.value = String(selectedPatientId);
      if (opportunitySelect) opportunitySelect.value = String(selectedPatientId);
    }
    carregarHistorico();
  }

  function carregarHistorico() {
    const container = document.getElementById('crm-historico');
    if (!container) return;
    if (!selectedPatientId) {
      container.innerHTML = '<div class="text-muted" style="margin-top:14px">Selecione um paciente para ver o histórico.</div>';
      return;
    }
    const rows = DB.query('SELECT * FROM crm_interacoes WHERE paciente_id=? ORDER BY id DESC LIMIT 30', [selectedPatientId]);
    container.innerHTML = rows.length ? `<div class="card-title" style="margin-top:16px">Histórico recente</div>${rows.map(row => `<div class="operations-history-item"><strong>${escapeHTML(row.tipo)}</strong><span>${escapeHTML(row.criado_em || '')}</span><p>${escapeHTML(row.descricao || '')}${row.resultado ? `<br><small>Resultado: ${escapeHTML(row.resultado)}</small>` : ''}</p></div>`).join('')}` : '<div class="text-muted" style="margin-top:14px">Sem interações registradas.</div>';
  }

  function registrarOportunidade() {
    if (!canAccess()) return alert('Acesso ao CRM não autorizado.');
    const patientId = document.getElementById('crm-op-paciente').value;
    const title = document.getElementById('crm-op-titulo').value.trim();
    if (!patientId || !title) return alert('Selecione o paciente e informe o título.');
    ensurePatientRecord(patientId);
    DB.run(`INSERT INTO crm_oportunidades (paciente_id,tipo,titulo,valor,etapa,proxima_acao_em,observacao) VALUES (?,?,?,?,?,?,?)`, [
      patientId, document.getElementById('crm-op-tipo').value, title,
      model.roundCurrency(document.getElementById('crm-op-valor').value),
      document.getElementById('crm-op-etapa').value,
      document.getElementById('crm-op-proxima').value || null,
      document.getElementById('crm-op-observacao').value.trim() || null
    ]);
    const opportunityId = DB.getLastId();
    document.getElementById('crm-op-titulo').value = '';
    document.getElementById('crm-op-valor').value = '';
    document.getElementById('crm-op-proxima').value = '';
    document.getElementById('crm-op-observacao').value = '';
    root.PlennusWhatsAppAutomation?.syncOpportunityMessage(opportunityId);
    carregarCRM();
  }

  function atualizarEtapaOportunidade(id, stage) {
    if (!model.OPPORTUNITY_STAGES.includes(stage)) return;
    DB.run(`UPDATE crm_oportunidades SET etapa=?,atualizado_em=datetime('now','localtime') WHERE id=?`, [stage, id]);
    root.PlennusWhatsAppAutomation?.syncOpportunityMessage(id);
    carregarOportunidades();
  }

  function onAppointmentStatusChanged(agendaId, status) {
    const appointment = DB.query('SELECT paciente_id,data,hora FROM agenda WHERE id=?', [agendaId])[0];
    if (!appointment?.paciente_id) return;
    ensurePatientRecord(appointment.paciente_id);
    const stage = status === 'realizado' ? 'acompanhamento' : ['agendado','confirmado','espera','atendimento'].includes(status) ? 'agendado' : null;
    if (stage) DB.run(`UPDATE crm_pacientes SET etapa=?,atualizado_em=datetime('now','localtime') WHERE paciente_id=?`, [stage, appointment.paciente_id]);
    const marker = `Agenda #${agendaId}: ${status}`;
    const existing = DB.query('SELECT id FROM crm_interacoes WHERE paciente_id=? AND descricao=? LIMIT 1', [appointment.paciente_id, marker])[0];
    if (!existing && ['agendado','confirmado','realizado','cancelado'].includes(status)) {
      DB.run(`INSERT INTO crm_interacoes (paciente_id,tipo,direcao,descricao,usuario_id) VALUES (?,?,?,?,?)`, [
        appointment.paciente_id, 'agenda', 'sistema', marker,
        typeof currentUser !== 'undefined' ? currentUser?.id || null : null
      ]);
    }
  }

  function onAppointmentCreated(agendaId) {
    onAppointmentStatusChanged(agendaId, 'agendado');
  }

  function carregarSelects() {
    const rows = DB.query('SELECT id,nome FROM pacientes WHERE ativo=1 ORDER BY nome');
    const options = '<option value="">Selecione</option>' + rows.map(row => `<option value="${row.id}">${escapeHTML(row.nome)}</option>`).join('');
    const intSelect = document.getElementById('crm-int-paciente');
    const opSelect = document.getElementById('crm-op-paciente');
    if (intSelect) intSelect.innerHTML = options;
    if (opSelect) opSelect.innerHTML = options;
    if (selectedPatientId) {
      if (intSelect) intSelect.value = String(selectedPatientId);
      if (opSelect) opSelect.value = String(selectedPatientId);
    }
  }

  function carregarPacientesCrm() {
    const body = document.getElementById('crm-pacientes-tabela');
    if (!body) return;
    const search = String(document.getElementById('crm-busca')?.value || '').trim().toLocaleLowerCase('pt-BR');
    const filter = document.getElementById('crm-filtro-etapa')?.value || '';
    const patients = DB.query(`SELECT p.*,c.etapa,c.proximo_contato_em,c.origem,c.observacao crm_observacao
      FROM pacientes p LEFT JOIN crm_pacientes c ON c.paciente_id=p.id WHERE p.ativo=1 ORDER BY p.nome`);
    const rows = patients.map(patient => {
      const dates = patientAttendanceDates(patient.id);
      const derivedInactive = patientDerivedInactive(patient, dates.last);
      const stage = patient.etapa || (derivedInactive ? 'inativo' : 'novo');
      const lastInteraction = DB.query('SELECT criado_em,tipo FROM crm_interacoes WHERE paciente_id=? ORDER BY id DESC LIMIT 1', [patient.id])[0];
      return { ...patient, stage, lastAttendance: dates.last, nextAppointment: dates.next, lastInteraction };
    }).filter(row => {
      const matchesText = !search || `${row.nome} ${row.cpf || ''} ${row.celular || ''} ${row.telefone || ''}`.toLocaleLowerCase('pt-BR').includes(search);
      return matchesText && (!filter || row.stage === filter);
    });
    body.innerHTML = rows.length ? rows.map(row => `<tr>
      <td><strong>${escapeHTML(row.nome)}</strong><br><small class="text-muted">${escapeHTML(row.celular || row.telefone || '-')}</small></td>
      <td><span class="operations-status ${row.stage === 'inativo' ? 'status-danger' : row.stage === 'retorno' ? 'status-warn' : 'status-ok'}">${escapeHTML(row.stage)}</span></td>
      <td>${escapeHTML(row.lastAttendance || '-')}</td><td>${escapeHTML(row.nextAppointment || '-')}</td><td>${escapeHTML(row.proximo_contato_em || '-')}</td>
      <td>${row.lastInteraction ? `${escapeHTML(row.lastInteraction.tipo)}<br><small>${escapeHTML(row.lastInteraction.criado_em || '')}</small>` : '-'}</td>
      <td><button class="btn btn-info btn-sm" onclick="PlennusCRM.selecionarPacienteCrm(${row.id})">Histórico</button> <button class="btn btn-whatsapp btn-sm" onclick="PlennusWhatsAppAutomation.queuePatientMessage(${row.id},'retorno')">WhatsApp</button></td>
    </tr>`).join('') : '<tr><td colspan="7" class="text-muted" style="text-align:center;padding:24px">Nenhum paciente encontrado.</td></tr>';
  }

  function carregarOportunidades() {
    const body = document.getElementById('crm-op-tabela');
    if (!body) return;
    const rows = DB.query(`SELECT o.*,p.nome paciente FROM crm_oportunidades o JOIN pacientes p ON p.id=o.paciente_id ORDER BY CASE WHEN o.etapa IN ('proposta','aguardando') THEN 0 ELSE 1 END,o.id DESC LIMIT 100`);
    body.innerHTML = rows.length ? rows.map(row => `<tr><td>${escapeHTML(row.paciente)}</td><td><strong>${escapeHTML(row.titulo)}</strong><br><small>${escapeHTML(row.tipo)}</small></td><td>${formatMoney(Number(row.valor || 0))}</td><td><select onchange="PlennusCRM.atualizarEtapaOportunidade(${row.id},this.value)">${model.OPPORTUNITY_STAGES.map(stage => `<option value="${stage}" ${stage === row.etapa ? 'selected' : ''}>${stage}</option>`).join('')}</select></td><td>${escapeHTML(row.proxima_acao_em || '-')}</td><td>${['proposta','aguardando'].includes(row.etapa) ? `<button class="btn btn-whatsapp btn-sm" onclick="PlennusWhatsAppAutomation.syncOpportunityMessage(${row.id},true)">WhatsApp</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:18px">Nenhuma oportunidade.</td></tr>';
  }

  function carregarKpis() {
    const patients = DB.query('SELECT id,criado_em FROM pacientes WHERE ativo=1');
    let inactive = 0;
    patients.forEach(patient => {
      const dates = patientAttendanceDates(patient.id);
      if (patientDerivedInactive(patient, dates.last)) inactive += 1;
    });
    const today = model.localIsoDate();
    const dueContacts = DB.query("SELECT COUNT(*) c FROM crm_pacientes WHERE proximo_contato_em IS NOT NULL AND proximo_contato_em<=?", [today])[0]?.c || 0;
    const pendingOpportunities = DB.query("SELECT COUNT(*) c FROM crm_oportunidades WHERE etapa IN ('proposta','aguardando')")[0]?.c || 0;
    const scheduled = DB.query("SELECT COUNT(DISTINCT paciente_id) c FROM agenda WHERE status IN ('agendado','confirmado')")[0]?.c || 0;
    const container = document.getElementById('crm-kpis');
    if (container) container.innerHTML = `
      <div class="operations-kpi"><span>Pacientes ativos</span><strong>${patients.length}</strong></div>
      <div class="operations-kpi"><span>Com consulta marcada</span><strong>${scheduled}</strong></div>
      <div class="operations-kpi"><span>Contatos vencidos/hoje</span><strong>${dueContacts}</strong></div>
      <div class="operations-kpi"><span>Inativos (180+ dias)</span><strong>${inactive}</strong></div>
      <div class="operations-kpi"><span>Oportunidades pendentes</span><strong>${pendingOpportunities}</strong></div>`;
  }

  function carregarCRM() {
    ensureCrmUi();
    if (!canAccess()) return;
    carregarSelects();
    carregarPacientesCrm();
    carregarOportunidades();
    carregarHistorico();
    carregarKpis();
  }

  const api = {
    ensureCrmUi,
    carregarCRM,
    registrarInteracao,
    registrarOportunidade,
    atualizarEtapaOportunidade,
    selecionarPacienteCrm,
    ensurePatientRecord,
    onAppointmentCreated,
    onAppointmentStatusChanged
  };
  root.PlennusCRM = api;
  ensureCrmUi();
})(typeof window !== 'undefined' ? window : globalThis);
