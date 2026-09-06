(function (root) {
  const model = root.PlennusOperationsModel;

  function canAccess() {
    const role = typeof currentUser !== 'undefined' ? currentUser?.nivel : null;
    return role === 'admin' || role === 'recepcao';
  }

  function nowLocalDateTime() {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }

  function shiftHours(localIso, hours) {
    const date = new Date(localIso);
    if (Number.isNaN(date.getTime())) return localIso;
    date.setHours(date.getHours() + hours);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }

  function clinicName() {
    try { return root.obterDadosClinica?.().nome || 'Plennus Clinic'; } catch (_) { return 'Plennus Clinic'; }
  }

  function ensureMenuItem() {
    const menu = document.getElementById('sidebar-menu');
    if (!menu || menu.querySelector('[data-page="whatsapp"]')) return;
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.dataset.page = 'whatsapp';
    item.dataset.roles = 'admin,recepcao';
    item.textContent = '◉  WhatsApp';
    const before = menu.querySelector('[data-page="configuracoes"]');
    if (before) menu.insertBefore(item, before); else menu.appendChild(item);
  }

  function ensureWhatsappUi() {
    ensureMenuItem();
    const main = document.querySelector('.main-content');
    if (!main || document.getElementById('page-whatsapp')) return;
    const page = document.createElement('div');
    page.className = 'page';
    page.id = 'page-whatsapp';
    page.innerHTML = `
      <div class="page-heading-row"><div><h1 class="page-title">WhatsApp operacional</h1><p class="text-muted">A fila é criada automaticamente. O envio abre o WhatsApp para revisão; o sistema não confirma entrega sem um provedor externo.</p></div><button class="btn btn-primary btn-sm" id="wpp-sync">Atualizar fila</button></div>
      <div class="operations-kpi-grid" id="wpp-kpis"></div>
      <div class="card">
        <div class="operations-toolbar">
          <div class="card-title" style="margin:0">Fila de mensagens</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <select id="wpp-filtro-status"><option value="">Todos os status</option><option value="pendente">Pendentes</option><option value="aberta">Abertas no WhatsApp</option><option value="enviada">Marcadas como enviadas</option><option value="cancelada">Canceladas</option></select>
            <select id="wpp-filtro-tipo"><option value="">Todos os tipos</option><option value="confirmacao">Confirmação</option><option value="lembrete">Lembrete</option><option value="retorno">Retorno</option><option value="orcamento">Orçamento</option><option value="cobranca">Cobrança</option></select>
          </div>
        </div>
        <div class="table-wrapper"><table><thead><tr><th>Agendada</th><th>Paciente</th><th>Tipo</th><th>Mensagem</th><th>Status</th><th>Ações</th></tr></thead><tbody id="wpp-tabela"></tbody></table></div>
      </div>`;
    main.appendChild(page);
    page.querySelector('#wpp-sync').addEventListener('click', () => { syncAllScheduledMessages(); carregarWhatsApp(); });
    page.querySelector('#wpp-filtro-status').addEventListener('change', carregarFila);
    page.querySelector('#wpp-filtro-tipo').addEventListener('change', carregarFila);
  }

  function patientPhone(patient) {
    return patient?.celular || patient?.telefone || '';
  }

  function normalizePhone(phone) {
    return root.PlennusValidation?.formatarTelefoneWhatsApp?.(phone || '') || '';
  }

  function upsertMessage({ patientId, type, originType, originId, phone, message, scheduledAt }) {
    const key = model.whatsappDedupeKey(type, originType, originId);
    DB.run(`INSERT OR IGNORE INTO mensagens_whatsapp
      (paciente_id,tipo,origem_tipo,origem_id,dedupe_key,telefone,mensagem,agendada_para,status)
      VALUES (?,?,?,?,?,?,?,?, 'pendente')`, [patientId || null, type, originType, originId, key, phone || null, message, scheduledAt || nowLocalDateTime()]);
    DB.run(`UPDATE mensagens_whatsapp SET telefone=?,mensagem=?,agendada_para=? WHERE dedupe_key=? AND status='pendente'`, [phone || null, message, scheduledAt || nowLocalDateTime(), key]);
    return DB.query('SELECT id FROM mensagens_whatsapp WHERE dedupe_key=?', [key])[0]?.id || null;
  }

  function appointmentContext(agendaId) {
    return DB.query(`SELECT a.*,p.nome paciente,p.celular,p.telefone,pr.nome profissional
      FROM agenda a LEFT JOIN pacientes p ON p.id=a.paciente_id LEFT JOIN profissionais pr ON pr.id=a.profissional_id WHERE a.id=?`, [agendaId])[0];
  }

  function syncAppointmentMessages(agendaId) {
    const appointment = appointmentContext(agendaId);
    if (!appointment || !['agendado','confirmado'].includes(appointment.status)) return [];
    const appointmentIso = model.appointmentDateTimeIso(appointment.data, appointment.hora);
    if (!appointmentIso) return [];
    const common = {
      paciente: appointment.paciente,
      clinica: clinicName(),
      profissional: appointment.profissional,
      data: appointment.data,
      hora: appointment.hora
    };
    const confirmationId = upsertMessage({
      patientId: appointment.paciente_id,
      type: 'confirmacao', originType: 'agenda', originId: appointment.id,
      phone: patientPhone(appointment), message: model.buildWhatsappMessage('confirmacao', common),
      scheduledAt: appointment.criado_em ? String(appointment.criado_em).replace(' ', 'T') : nowLocalDateTime()
    });
    const reminderId = upsertMessage({
      patientId: appointment.paciente_id,
      type: 'lembrete', originType: 'agenda', originId: appointment.id,
      phone: patientPhone(appointment), message: model.buildWhatsappMessage('lembrete', common),
      scheduledAt: shiftHours(appointmentIso, -24)
    });
    return [confirmationId, reminderId].filter(Boolean);
  }

  function syncCrmPatientMessages(patientId) {
    const row = DB.query(`SELECT p.id,p.nome,p.celular,p.telefone,c.proximo_contato_em FROM pacientes p
      JOIN crm_pacientes c ON c.paciente_id=p.id WHERE p.id=?`, [patientId])[0];
    if (!row?.proximo_contato_em) return null;
    return upsertMessage({
      patientId: row.id, type: 'retorno', originType: 'crm_paciente', originId: row.id,
      phone: patientPhone(row), message: model.buildWhatsappMessage('retorno', { paciente: row.nome, clinica: clinicName() }),
      scheduledAt: `${row.proximo_contato_em}T09:00:00`
    });
  }

  function syncOpportunityMessage(opportunityId, openAfter = false) {
    const row = DB.query(`SELECT o.*,p.nome paciente,p.celular,p.telefone FROM crm_oportunidades o JOIN pacientes p ON p.id=o.paciente_id WHERE o.id=?`, [opportunityId])[0];
    if (!row || !['proposta','aguardando'].includes(row.etapa)) return null;
    const id = upsertMessage({
      patientId: row.paciente_id, type: 'orcamento', originType: 'crm_oportunidade', originId: row.id,
      phone: patientPhone(row), message: model.buildWhatsappMessage('orcamento', { paciente: row.paciente, clinica: clinicName(), titulo: row.titulo }),
      scheduledAt: row.proxima_acao_em ? `${row.proxima_acao_em}T09:00:00` : nowLocalDateTime()
    });
    if (openAfter && id) openMessage(id);
    return id;
  }

  function syncFinancialMessage(entryId) {
    const row = DB.query(`SELECT f.*,p.nome paciente,p.celular,p.telefone FROM financeiro_lancamentos f
      JOIN pacientes p ON p.id=f.paciente_id WHERE f.id=?`, [entryId])[0];
    if (!row || row.tipo !== 'receita') return null;
    if (row.status === 'pago' || row.status === 'cancelado') {
      DB.run(`UPDATE mensagens_whatsapp SET status='cancelada' WHERE origem_tipo='financeiro' AND origem_id=? AND status IN ('pendente','aberta')`, [entryId]);
      return null;
    }
    if (!row.vencimento_em) return null;
    return upsertMessage({
      patientId: row.paciente_id, type: 'cobranca', originType: 'financeiro', originId: row.id,
      phone: patientPhone(row), message: model.buildWhatsappMessage('cobranca', { paciente: row.paciente, clinica: clinicName(), valor: formatMoney(Number(row.valor || 0)) }),
      scheduledAt: `${row.vencimento_em}T09:00:00`
    });
  }

  function syncAllScheduledMessages() {
    if (!canAccess()) return 0;
    const appointments = DB.query("SELECT id FROM agenda WHERE status IN ('agendado','confirmado')");
    appointments.forEach(row => syncAppointmentMessages(row.id));
    DB.query('SELECT paciente_id FROM crm_pacientes WHERE proximo_contato_em IS NOT NULL').forEach(row => syncCrmPatientMessages(row.paciente_id));
    DB.query("SELECT id FROM crm_oportunidades WHERE etapa IN ('proposta','aguardando')").forEach(row => syncOpportunityMessage(row.id));
    DB.query("SELECT id FROM financeiro_lancamentos WHERE tipo='receita' AND status='pendente' AND paciente_id IS NOT NULL AND vencimento_em IS NOT NULL").forEach(row => syncFinancialMessage(row.id));
    return appointments.length;
  }

  function queuePatientMessage(patientId, type = 'retorno') {
    if (!canAccess()) return alert('Acesso ao WhatsApp não autorizado.');
    const patient = DB.query('SELECT id,nome,celular,telefone FROM pacientes WHERE id=?', [patientId])[0];
    if (!patient) return null;
    const messageType = model.WHATSAPP_TYPES.includes(type) ? type : 'retorno';
    const uniqueOrigin = Date.now();
    DB.run(`INSERT INTO mensagens_whatsapp (paciente_id,tipo,origem_tipo,origem_id,dedupe_key,telefone,mensagem,agendada_para,status)
      VALUES (?,?,?,?,?,?,?,?, 'pendente')`, [
      patient.id, messageType, 'manual', uniqueOrigin, `${messageType}:manual:${patient.id}:${uniqueOrigin}`,
      patientPhone(patient), model.buildWhatsappMessage(messageType, { paciente: patient.nome, clinica: clinicName() }), nowLocalDateTime()
    ]);
    const id = DB.getLastId();
    openMessage(id);
    return id;
  }

  function openAppointmentMessage(agendaId, type = 'confirmacao') {
    const ids = syncAppointmentMessages(agendaId);
    const row = DB.query('SELECT id FROM mensagens_whatsapp WHERE origem_tipo=? AND origem_id=? AND tipo=? ORDER BY id DESC LIMIT 1', ['agenda', agendaId, type])[0];
    if (row?.id) return openMessage(row.id);
    if (!ids.length) alert('Não foi possível criar a mensagem para este agendamento.');
    return null;
  }

  function recordCrmInteraction(message, statusText) {
    if (!message.paciente_id) return;
    try {
      DB.run(`INSERT INTO crm_interacoes (paciente_id,tipo,direcao,descricao,resultado,usuario_id) VALUES (?,?,?,?,?,?)`, [
        message.paciente_id, 'whatsapp', 'saida', `WhatsApp ${message.tipo}`, statusText,
        typeof currentUser !== 'undefined' ? currentUser?.id || null : null
      ]);
    } catch (_) { /* CRM may be unavailable during an interrupted migration */ }
  }

  function openMessage(id) {
    if (!canAccess()) return alert('Acesso ao WhatsApp não autorizado.');
    const message = DB.query('SELECT * FROM mensagens_whatsapp WHERE id=?', [id])[0];
    if (!message || message.status === 'cancelada') return null;
    const phone = normalizePhone(message.telefone);
    if (!phone) return alert('O paciente não possui telefone celular válido com DDD cadastrado.');
    const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message.mensagem)}`;
    if (window.electronAPI && typeof window.electronAPI.abrirUrlExterna === 'function') window.electronAPI.abrirUrlExterna(url);
    else window.open(url, '_blank');
    DB.run(`UPDATE mensagens_whatsapp SET status='aberta',aberta_em=datetime('now','localtime') WHERE id=? AND status='pendente'`, [id]);
    recordCrmInteraction(message, 'aberta_no_whatsapp');
    carregarFila();
    return url;
  }

  function markSent(id) {
    if (!canAccess()) return;
    const message = DB.query('SELECT * FROM mensagens_whatsapp WHERE id=?', [id])[0];
    if (!message || message.status === 'cancelada') return;
    DB.run(`UPDATE mensagens_whatsapp SET status='enviada',enviada_em=datetime('now','localtime') WHERE id=?`, [id]);
    recordCrmInteraction(message, 'marcada_como_enviada');
    carregarWhatsApp();
  }

  function cancelMessage(id) {
    if (!canAccess()) return;
    DB.run(`UPDATE mensagens_whatsapp SET status='cancelada' WHERE id=? AND status!='enviada'`, [id]);
    carregarWhatsApp();
  }

  function cancelAppointmentMessages(agendaId) {
    DB.run(`UPDATE mensagens_whatsapp SET status='cancelada' WHERE origem_tipo='agenda' AND origem_id=? AND status IN ('pendente','aberta')`, [agendaId]);
  }

  function carregarKpis() {
    const now = nowLocalDateTime();
    const today = model.localIsoDate();
    const due = DB.query("SELECT COUNT(*) c FROM mensagens_whatsapp WHERE status='pendente' AND COALESCE(agendada_para,'')<=?", [now])[0]?.c || 0;
    const future = DB.query("SELECT COUNT(*) c FROM mensagens_whatsapp WHERE status='pendente' AND COALESCE(agendada_para,'')>?", [now])[0]?.c || 0;
    const opened = DB.query("SELECT COUNT(*) c FROM mensagens_whatsapp WHERE status='aberta'")[0]?.c || 0;
    const sentToday = DB.query("SELECT COUNT(*) c FROM mensagens_whatsapp WHERE status='enviada' AND substr(enviada_em,1,10)=?", [today])[0]?.c || 0;
    const container = document.getElementById('wpp-kpis');
    if (container) container.innerHTML = `
      <div class="operations-kpi"><span>Pendentes agora</span><strong>${due}</strong></div>
      <div class="operations-kpi"><span>Agendadas</span><strong>${future}</strong></div>
      <div class="operations-kpi"><span>Abertas no WhatsApp</span><strong>${opened}</strong></div>
      <div class="operations-kpi"><span>Marcadas enviadas hoje</span><strong>${sentToday}</strong></div>`;
  }

  function typeLabel(type) {
    return ({ confirmacao:'Confirmação', lembrete:'Lembrete', retorno:'Retorno', orcamento:'Orçamento', cobranca:'Cobrança' })[type] || type;
  }

  function carregarFila() {
    const body = document.getElementById('wpp-tabela');
    if (!body) return;
    const status = document.getElementById('wpp-filtro-status')?.value || '';
    const type = document.getElementById('wpp-filtro-tipo')?.value || '';
    let rows = DB.query(`SELECT m.*,p.nome paciente FROM mensagens_whatsapp m LEFT JOIN pacientes p ON p.id=m.paciente_id ORDER BY CASE m.status WHEN 'pendente' THEN 0 WHEN 'aberta' THEN 1 ELSE 2 END,COALESCE(m.agendada_para,m.criado_em),m.id DESC LIMIT 250`);
    rows = rows.filter(row => (!status || row.status === status) && (!type || row.tipo === type));
    body.innerHTML = rows.length ? rows.map(row => {
      const actions = row.status === 'pendente'
        ? `<button class="btn btn-whatsapp btn-sm" onclick="PlennusWhatsAppAutomation.openMessage(${row.id})">Abrir</button> <button class="btn btn-danger btn-sm" onclick="PlennusWhatsAppAutomation.cancelMessage(${row.id})">Cancelar</button>`
        : row.status === 'aberta'
          ? `<button class="btn btn-whatsapp btn-sm" onclick="PlennusWhatsAppAutomation.openMessage(${row.id})">Reabrir</button> <button class="btn btn-success btn-sm" onclick="PlennusWhatsAppAutomation.markSent(${row.id})">Marcar enviada</button>`
          : '';
      return `<tr><td>${escapeHTML(row.agendada_para || '-')}</td><td>${escapeHTML(row.paciente || '-')}</td><td>${escapeHTML(typeLabel(row.tipo))}</td><td class="operations-message-cell">${escapeHTML(row.mensagem)}</td><td><span class="operations-status ${row.status === 'enviada' ? 'status-ok' : row.status === 'cancelada' ? 'status-muted' : row.status === 'aberta' ? 'status-warn' : 'status-danger'}">${escapeHTML(row.status)}</span></td><td>${actions}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:24px">Fila vazia.</td></tr>';
  }

  function carregarWhatsApp() {
    ensureWhatsappUi();
    if (!canAccess()) return;
    syncAllScheduledMessages();
    carregarKpis();
    carregarFila();
  }

  const api = {
    ensureWhatsappUi,
    carregarWhatsApp,
    syncAllScheduledMessages,
    syncAppointmentMessages,
    syncCrmPatientMessages,
    syncOpportunityMessage,
    syncFinancialMessage,
    queuePatientMessage,
    openAppointmentMessage,
    openMessage,
    markSent,
    cancelMessage,
    cancelAppointmentMessages
  };
  root.PlennusWhatsAppAutomation = api;
  ensureWhatsappUi();
})(typeof window !== 'undefined' ? window : globalThis);
