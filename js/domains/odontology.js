(function (root) {
  const model = root.PlennusOdontologyModel;
  let selectedPatientId = null;
  let selectedTooth = null;
  let selectedPlanId = null;
  let selectedBudgetId = null;
  let pendingTreatmentItemId = null;

  function canAccess() {
    const role = typeof currentUser !== 'undefined' ? currentUser?.nivel : null;
    return ['admin', 'recepcao', 'medico'].includes(role);
  }

  function canEditClinical() {
    const role = typeof currentUser !== 'undefined' ? currentUser?.nivel : null;
    return ['admin', 'medico'].includes(role);
  }

  function ensureMenuItem() {
    const menu = document.getElementById('sidebar-menu');
    if (!menu || menu.querySelector('[data-page="odontologia"]')) return;
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.dataset.page = 'odontologia';
    item.dataset.roles = 'admin,recepcao,medico';
    item.textContent = '◌  Odontologia';
    const before = menu.querySelector('[data-page="financeiro"]') || menu.querySelector('[data-page="configuracoes"]');
    if (before) menu.insertBefore(item, before); else menu.appendChild(item);
  }

  function ensureUi() {
    ensureMenuItem();
    const main = document.querySelector('.main-content');
    if (!main || document.getElementById('page-odontologia')) return;
    const page = document.createElement('div');
    page.className = 'page';
    page.id = 'page-odontologia';
    page.innerHTML = `
      <div class="page-heading-row"><div><h1 class="page-title">Odontologia</h1><p class="text-muted">Odontograma, plano de tratamento, orçamento e integração com Agenda e Financeiro.</p></div></div>
      <div class="card odontology-patient-bar">
        <div class="form-group"><label>Paciente *</label><select id="od-paciente"><option value="">Selecione</option></select></div>
        <div id="od-patient-summary" class="text-muted">Selecione um paciente para iniciar.</div>
      </div>
      <div id="od-workspace" hidden>
        <div class="odontology-tabs">
          <button type="button" class="active" data-od-tab="odontograma">Odontograma</button>
          <button type="button" data-od-tab="tratamento">Plano de tratamento</button>
          <button type="button" data-od-tab="orcamento">Orçamentos</button>
        </div>
        <section id="od-panel-odontograma" class="odontology-panel active">
          <div class="odontology-layout">
            <div class="card">
              <div class="odontogram-toolbar"><div><div class="card-title">Odontograma</div><small class="text-muted">Numeração FDI permanente e decídua.</small></div><select id="od-denticao"><option value="permanente">Permanente</option><option value="decidua">Decídua</option></select></div>
              <div id="od-tooth-grid" class="odontogram-grid"></div>
              <div class="odontology-selection"><span>Dente selecionado:</span><strong id="od-selected-tooth">—</strong></div>
              <div id="od-condition-list" class="odontology-condition-list"></div>
            </div>
            <div class="card">
              <div class="card-title">Registrar condição</div>
              <div class="form-row"><div class="form-group"><label>Condição</label><select id="od-condicao"></select></div><div class="form-group"><label>Face</label><select id="od-face"><option value="">Dente inteiro</option></select></div></div>
              <div class="form-group"><label>Observação</label><textarea id="od-condicao-obs" rows="4"></textarea></div>
              <div class="form-actions"><button id="od-save-condition" class="btn btn-primary btn-sm">Registrar</button></div>
            </div>
          </div>
        </section>
        <section id="od-panel-tratamento" class="odontology-panel">
          <div class="operations-grid-2">
            <div class="card">
              <div class="card-title">Planos do paciente</div>
              <div class="form-row"><div class="form-group" style="flex:2"><label>Novo plano</label><input id="od-plan-title" placeholder="Ex.: Reabilitação superior"></div><div class="form-group"><label>Responsável</label><select id="od-plan-professional"></select></div></div>
              <button id="od-create-plan" class="btn btn-primary btn-sm">Criar plano</button>
              <hr>
              <div class="form-group"><label>Plano ativo</label><select id="od-plan-select"><option value="">Selecione</option></select></div>
              <div id="od-plan-summary" class="text-muted"></div>
            </div>
            <div class="card">
              <div class="card-title">Adicionar procedimento</div>
              <div class="form-row"><div class="form-group"><label>Procedimento</label><select id="od-item-procedure"></select></div><div class="form-group"><label>Dente</label><input id="od-item-tooth" type="number" placeholder="11"></div><div class="form-group"><label>Face</label><select id="od-item-face"><option value="">Dente inteiro</option></select></div></div>
              <div class="form-row"><div class="form-group"><label>Descrição</label><input id="od-item-description"></div><div class="form-group"><label>Qtd.</label><input id="od-item-qty" type="number" min="0.01" step="0.01" value="1"></div></div>
              <div class="form-row"><div class="form-group"><label>Valor unitário</label><input id="od-item-unit" type="number" min="0" step="0.01"></div><div class="form-group"><label>Desconto</label><input id="od-item-discount" type="number" min="0" step="0.01" value="0"></div></div>
              <button id="od-add-item" class="btn btn-primary btn-sm">Adicionar ao plano</button>
            </div>
          </div>
          <div class="card"><div class="card-title">Itens do plano</div><div class="table-wrapper"><table><thead><tr><th>Procedimento</th><th>Dente/face</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody id="od-plan-items"></tbody></table></div></div>
        </section>
        <section id="od-panel-orcamento" class="odontology-panel">
          <div class="operations-grid-2">
            <div class="card"><div class="card-title">Gerar orçamento</div><p class="text-muted">O orçamento é um snapshot do plano. Nenhuma receita é criada até o procedimento ser realizado.</p><button id="od-generate-budget" class="btn btn-primary btn-sm">Gerar nova versão do plano ativo</button><div id="od-budget-list" style="margin-top:14px"></div></div>
            <div class="card"><div class="card-title">Detalhes do orçamento</div><div id="od-budget-detail" class="odontology-empty">Selecione um orçamento.</div></div>
          </div>
        </section>
      </div>`;
    main.appendChild(page);

    page.querySelector('#od-paciente').addEventListener('change', event => selectPatient(event.target.value));
    page.querySelector('#od-denticao').addEventListener('change', renderOdontogram);
    page.querySelector('#od-save-condition').addEventListener('click', saveCondition);
    page.querySelector('#od-create-plan').addEventListener('click', createPlan);
    page.querySelector('#od-plan-select').addEventListener('change', event => selectPlan(event.target.value));
    page.querySelector('#od-item-procedure').addEventListener('change', syncProcedureDefaults);
    page.querySelector('#od-add-item').addEventListener('click', addPlanItem);
    page.querySelector('#od-generate-budget').addEventListener('click', () => generateBudget(selectedPlanId));
    page.querySelectorAll('[data-od-tab]').forEach(button => button.addEventListener('click', () => activateTab(button.dataset.odTab)));
    populateStaticSelects();
  }

  function activateTab(tab) {
    document.querySelectorAll('[data-od-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.odTab === tab));
    document.querySelectorAll('.odontology-panel').forEach(panel => panel.classList.toggle('active', panel.id === `od-panel-${tab}`));
  }

  function populateStaticSelects() {
    const conditions = document.getElementById('od-condicao');
    if (conditions) conditions.innerHTML = model.CONDITION_TYPES.map(value => `<option value="${value}">${label(value)}</option>`).join('');
    for (const id of ['od-face', 'od-item-face']) {
      const select = document.getElementById(id);
      if (!select) continue;
      const first = select.querySelector('option');
      select.innerHTML = first?.outerHTML || '<option value="">Dente inteiro</option>';
      select.insertAdjacentHTML('beforeend', model.SURFACES.map(value => `<option value="${value}">${label(value)}</option>`).join(''));
    }
  }

  function label(value) {
    return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
  }

  function populatePatientSelect() {
    const select = document.getElementById('od-paciente');
    if (!select || !root.DB?.isReady?.()) return;
    const current = selectedPatientId ? String(selectedPatientId) : '';
    select.innerHTML = '<option value="">Selecione</option>' + root.DB.query('SELECT id,nome FROM pacientes WHERE ativo=1 ORDER BY nome').map(row => `<option value="${row.id}">${root.escapeHTML(row.nome)}</option>`).join('');
    if (current) select.value = current;
  }

  function populateProfessionalAndProcedureSelects() {
    const professional = document.getElementById('od-plan-professional');
    if (professional) professional.innerHTML = '<option value="">A definir</option>' + root.DB.query('SELECT id,nome FROM profissionais WHERE ativo=1 ORDER BY nome').map(row => `<option value="${row.id}">${root.escapeHTML(row.nome)}</option>`).join('');
    const procedure = document.getElementById('od-item-procedure');
    if (procedure) procedure.innerHTML = '<option value="">Selecione</option>' + root.DB.query('SELECT id,nome,valor_particular FROM procedimentos WHERE ativo=1 ORDER BY nome').map(row => `<option value="${row.id}" data-name="${root.escapeHTML(row.nome)}" data-value="${Number(row.valor_particular || 0)}">${root.escapeHTML(row.nome)} — ${root.formatMoney(Number(row.valor_particular || 0))}</option>`).join('');
  }

  function syncProcedureDefaults() {
    const select = document.getElementById('od-item-procedure');
    const option = select?.options?.[select.selectedIndex];
    if (!option?.value) return;
    document.getElementById('od-item-description').value = option.dataset.name || option.textContent.split(' — ')[0];
    document.getElementById('od-item-unit').value = Number(option.dataset.value || 0).toFixed(2);
  }

  function selectPatient(value) {
    selectedPatientId = Number(value) || null;
    selectedTooth = null;
    selectedPlanId = null;
    selectedBudgetId = null;
    const workspace = document.getElementById('od-workspace');
    if (workspace) workspace.hidden = !selectedPatientId;
    if (!selectedPatientId) return;
    const patient = root.DB.query('SELECT * FROM pacientes WHERE id=?', [selectedPatientId])[0];
    const summary = document.getElementById('od-patient-summary');
    if (summary) summary.textContent = `${patient?.nome || ''}${patient?.data_nascimento ? ` • Nasc. ${patient.data_nascimento}` : ''}`;
    renderOdontogram();
    loadPlans();
    loadBudgets();
  }

  function ensureOdontogram(patientId) {
    root.DB.run('INSERT OR IGNORE INTO odontogramas (paciente_id) VALUES (?)', [patientId]);
    return root.DB.query('SELECT * FROM odontogramas WHERE paciente_id=?', [patientId])[0];
  }

  function renderOdontogram() {
    if (!selectedPatientId) return;
    const odontogram = ensureOdontogram(selectedPatientId);
    const dentition = document.getElementById('od-denticao')?.value || 'permanente';
    const teeth = dentition === 'decidua' ? model.deciduousTeeth() : model.permanentTeeth();
    const active = root.DB.query('SELECT dente,COUNT(*) c FROM odontograma_condicoes WHERE odontograma_id=? AND ativo=1 GROUP BY dente', [odontogram.id]);
    const withConditions = new Set(active.map(row => Number(row.dente)));
    const grid = document.getElementById('od-tooth-grid');
    if (!grid) return;
    grid.classList.toggle('deciduous', dentition === 'decidua');
    grid.innerHTML = teeth.map(tooth => `<button type="button" class="tooth-btn ${selectedTooth === tooth ? 'active' : ''} ${withConditions.has(tooth) ? 'has-condition' : ''}" onclick="PlennusOdontology.selectTooth(${tooth})">${tooth}</button>`).join('');
    renderConditions();
  }

  function selectTooth(tooth) {
    if (!model.isValidFdiTooth(tooth)) return;
    selectedTooth = Number(tooth);
    const selected = document.getElementById('od-selected-tooth');
    if (selected) selected.textContent = selectedTooth;
    const itemTooth = document.getElementById('od-item-tooth');
    if (itemTooth) itemTooth.value = selectedTooth;
    renderOdontogram();
  }

  function renderConditions() {
    const selected = document.getElementById('od-selected-tooth');
    if (selected) selected.textContent = selectedTooth || '—';
    const container = document.getElementById('od-condition-list');
    if (!container) return;
    if (!selectedPatientId || !selectedTooth) {
      container.innerHTML = '<div class="odontology-empty">Selecione um dente.</div>';
      return;
    }
    const odontogram = ensureOdontogram(selectedPatientId);
    const rows = root.DB.query('SELECT * FROM odontograma_condicoes WHERE odontograma_id=? AND dente=? AND ativo=1 ORDER BY id DESC', [odontogram.id, selectedTooth]);
    container.innerHTML = rows.length ? rows.map(row => `<div class="odontology-condition-item"><div><strong>${root.escapeHTML(label(row.condicao))}</strong><div class="text-muted">${root.escapeHTML(row.face ? label(row.face) : 'Dente inteiro')}${row.observacao ? ` • ${root.escapeHTML(row.observacao)}` : ''}</div></div>${canEditClinical() ? `<button class="btn btn-danger btn-sm" onclick="PlennusOdontology.removeCondition(${row.id})">Remover</button>` : ''}</div>`).join('') : '<div class="odontology-empty">Nenhuma condição ativa neste dente.</div>';
  }

  function saveCondition() {
    if (!canEditClinical()) return alert('Somente profissional clínico ou administrador pode alterar o odontograma.');
    if (!selectedPatientId || !selectedTooth) return alert('Selecione um paciente e um dente.');
    const condition = document.getElementById('od-condicao').value;
    const face = model.normalizeSurface(document.getElementById('od-face').value);
    const observation = document.getElementById('od-condicao-obs').value.trim() || null;
    const odontogram = ensureOdontogram(selectedPatientId);
    root.DB.run(`INSERT INTO odontograma_condicoes (odontograma_id,dente,face,condicao,observacao,registrado_por) VALUES (?,?,?,?,?,?)`, [odontogram.id, selectedTooth, face, condition, observation, typeof currentUser !== 'undefined' ? currentUser?.id || null : null]);
    root.DB.run("UPDATE odontogramas SET atualizado_em=datetime('now','localtime') WHERE id=?", [odontogram.id]);
    document.getElementById('od-condicao-obs').value = '';
    renderOdontogram();
  }

  function removeCondition(id) {
    if (!canEditClinical()) return;
    root.DB.run("UPDATE odontograma_condicoes SET ativo=0,atualizado_em=datetime('now','localtime') WHERE id=?", [id]);
    renderOdontogram();
  }

  function createPlan() {
    if (!canAccess() || !selectedPatientId) return;
    const title = document.getElementById('od-plan-title').value.trim();
    if (!title) return alert('Informe o nome do plano.');
    const professionalId = document.getElementById('od-plan-professional').value || null;
    root.DB.run('INSERT INTO planos_tratamento (paciente_id,profissional_id,titulo) VALUES (?,?,?)', [selectedPatientId, professionalId, title]);
    selectedPlanId = root.DB.getLastId();
    document.getElementById('od-plan-title').value = '';
    loadPlans();
  }

  function loadPlans() {
    if (!selectedPatientId) return;
    populateProfessionalAndProcedureSelects();
    const rows = root.DB.query('SELECT * FROM planos_tratamento WHERE paciente_id=? ORDER BY id DESC', [selectedPatientId]);
    const select = document.getElementById('od-plan-select');
    if (select) {
      select.innerHTML = '<option value="">Selecione</option>' + rows.map(row => `<option value="${row.id}">${root.escapeHTML(row.titulo)} — ${label(row.status)}</option>`).join('');
      if (selectedPlanId && rows.some(row => row.id === selectedPlanId)) select.value = String(selectedPlanId);
      else if (rows[0]) { selectedPlanId = rows[0].id; select.value = String(selectedPlanId); }
    }
    renderPlan();
  }

  function selectPlan(value) {
    selectedPlanId = Number(value) || null;
    renderPlan();
    loadBudgets();
  }

  function recalcPlanTotal(planId) {
    const total = Number(root.DB.query("SELECT COALESCE(SUM(valor_total),0) total FROM plano_tratamento_itens WHERE plano_id=? AND status!='cancelado'", [planId])[0]?.total || 0);
    root.DB.run("UPDATE planos_tratamento SET valor_total=?,atualizado_em=datetime('now','localtime') WHERE id=?", [model.roundCurrency(total), planId]);
    return model.roundCurrency(total);
  }

  function addPlanItem() {
    if (!selectedPlanId) return alert('Selecione ou crie um plano.');
    const procedureId = Number(document.getElementById('od-item-procedure').value) || null;
    const description = document.getElementById('od-item-description').value.trim();
    if (!description) return alert('Informe o procedimento/descrição.');
    const toothRaw = document.getElementById('od-item-tooth').value.trim();
    const tooth = toothRaw ? Number(toothRaw) : null;
    if (tooth != null && !model.isValidFdiTooth(tooth)) return alert('Numeração FDI inválida.');
    const face = model.normalizeSurface(document.getElementById('od-item-face').value);
    const quantity = model.toNumber(document.getElementById('od-item-qty').value, 1);
    const unitPrice = model.toNumber(document.getElementById('od-item-unit').value);
    const discount = model.toNumber(document.getElementById('od-item-discount').value);
    let total;
    try { total = model.calculateTreatmentItemTotal({ quantity, unitPrice, discount }); } catch (error) { return alert(error.message); }
    const plan = root.DB.query('SELECT profissional_id FROM planos_tratamento WHERE id=?', [selectedPlanId])[0];
    root.DB.run(`INSERT INTO plano_tratamento_itens (plano_id,procedimento_id,profissional_id,descricao,dente,face,quantidade,valor_unitario,desconto,valor_total) VALUES (?,?,?,?,?,?,?,?,?,?)`, [selectedPlanId, procedureId, plan?.profissional_id || null, description, tooth, face, quantity, unitPrice, discount, total]);
    recalcPlanTotal(selectedPlanId);
    document.getElementById('od-item-description').value = '';
    document.getElementById('od-item-tooth').value = '';
    document.getElementById('od-item-unit').value = '';
    document.getElementById('od-item-discount').value = '0';
    renderPlan();
  }

  function renderPlan() {
    const summary = document.getElementById('od-plan-summary');
    const body = document.getElementById('od-plan-items');
    if (!body) return;
    if (!selectedPlanId) {
      if (summary) summary.textContent = 'Nenhum plano selecionado.';
      body.innerHTML = '<tr><td colspan="5" class="odontology-empty">Crie ou selecione um plano.</td></tr>';
      return;
    }
    const plan = root.DB.query('SELECT * FROM planos_tratamento WHERE id=?', [selectedPlanId])[0];
    const total = recalcPlanTotal(selectedPlanId);
    if (summary) summary.innerHTML = `<strong>${root.escapeHTML(plan?.titulo || '')}</strong> • ${label(plan?.status)} • ${root.formatMoney(total)}`;
    const rows = root.DB.query(`SELECT i.*,p.nome procedimento FROM plano_tratamento_itens i LEFT JOIN procedimentos p ON p.id=i.procedimento_id WHERE i.plano_id=? ORDER BY i.id`, [selectedPlanId]);
    body.innerHTML = rows.length ? rows.map(row => {
      const dental = row.dente ? `${row.dente}${row.face ? ` / ${label(row.face)}` : ''}` : '—';
      const schedule = row.status === 'planejado' ? `<button class="btn btn-primary btn-sm" onclick="PlennusOdontology.prepareAppointment(${row.id})">Agendar</button>` : '';
      const cancel = row.status !== 'realizado' && row.status !== 'cancelado' ? `<button class="btn btn-danger btn-sm" onclick="PlennusOdontology.cancelPlanItem(${row.id})">Cancelar</button>` : '';
      return `<tr><td><strong>${root.escapeHTML(row.descricao)}</strong><div class="treatment-item-meta">${root.escapeHTML(row.procedimento || '')}</div></td><td>${root.escapeHTML(dental)}</td><td>${root.formatMoney(Number(row.valor_total || 0))}</td><td>${label(row.status)}</td><td>${schedule} ${cancel}</td></tr>`;
    }).join('') : '<tr><td colspan="5" class="odontology-empty">Nenhum procedimento no plano.</td></tr>';
  }

  function cancelPlanItem(id) {
    const item = root.DB.query('SELECT * FROM plano_tratamento_itens WHERE id=?', [id])[0];
    if (!item || item.status === 'realizado') return;
    root.DB.run("UPDATE plano_tratamento_itens SET status='cancelado',atualizado_em=datetime('now','localtime') WHERE id=?", [id]);
    recalcPlanTotal(item.plano_id);
    refreshPlanStatus(item.plano_id);
    renderPlan();
  }

  function latestBudgetForPlan(planId) {
    return root.DB.query('SELECT * FROM orcamentos_odontologicos WHERE plano_id=? AND status!=\'cancelado\' ORDER BY versao DESC LIMIT 1', [planId])[0] || null;
  }

  function canScheduleItem(itemId) {
    const item = root.DB.query('SELECT * FROM plano_tratamento_itens WHERE id=?', [itemId])[0];
    if (!item || item.status !== 'planejado') return { ok: false, reason: 'Item indisponível para agendamento.' };
    const budget = latestBudgetForPlan(item.plano_id);
    if (!budget) return { ok: true, item };
    const budgetItem = root.DB.query('SELECT status FROM orcamento_odontologico_itens WHERE orcamento_id=? AND plano_item_id=?', [budget.id, item.id])[0];
    if (budgetItem?.status !== 'aprovado') return { ok: false, reason: 'Este item possui orçamento e ainda não foi aprovado.' };
    return { ok: true, item };
  }

  function prepareAppointment(itemId) {
    const check = canScheduleItem(itemId);
    if (!check.ok) return alert(check.reason);
    pendingTreatmentItemId = itemId;
    const item = root.DB.query(`SELECT i.*,p.paciente_id,p.profissional_id plano_profissional FROM plano_tratamento_itens i JOIN planos_tratamento p ON p.id=i.plano_id WHERE i.id=?`, [itemId])[0];
    root.navegar('agenda');
    const patient = document.getElementById('ag-paciente');
    const professional = document.getElementById('ag-profissional');
    const procedure = document.getElementById('ag-procedimento');
    if (patient) patient.value = String(item.paciente_id);
    if (professional && (item.profissional_id || item.plano_profissional)) professional.value = String(item.profissional_id || item.plano_profissional);
    if (procedure && item.procedimento_id) procedure.value = String(item.procedimento_id);
    alert('Plano vinculado. Escolha data e horário e salve o agendamento normalmente.');
  }

  function onAppointmentCreated(agendaId) {
    if (!pendingTreatmentItemId) return null;
    const item = root.DB.query(`SELECT i.*,p.paciente_id FROM plano_tratamento_itens i JOIN planos_tratamento p ON p.id=i.plano_id WHERE i.id=?`, [pendingTreatmentItemId])[0];
    const appointment = root.DB.query('SELECT * FROM agenda WHERE id=?', [agendaId])[0];
    if (!item || !appointment || Number(appointment.paciente_id) !== Number(item.paciente_id)) return null;
    root.DB.run("UPDATE plano_tratamento_itens SET agenda_id=?,profissional_id=COALESCE(?,profissional_id),status='agendado',atualizado_em=datetime('now','localtime') WHERE id=?", [agendaId, appointment.profissional_id || null, item.id]);
    root.DB.run("UPDATE planos_tratamento SET status='em_tratamento',atualizado_em=datetime('now','localtime') WHERE id=? AND status!='cancelado'", [item.plano_id]);
    pendingTreatmentItemId = null;
    return item.id;
  }

  function refreshPlanStatus(planId) {
    const statuses = root.DB.query('SELECT status FROM plano_tratamento_itens WHERE plano_id=?', [planId]).map(row => row.status);
    if (model.isTreatmentPlanComplete(statuses)) root.DB.run("UPDATE planos_tratamento SET status='concluido',atualizado_em=datetime('now','localtime') WHERE id=? AND status!='cancelado'", [planId]);
  }

  function onAppointmentStatusChanged(agendaId, status) {
    const item = root.DB.query('SELECT * FROM plano_tratamento_itens WHERE agenda_id=?', [agendaId])[0];
    if (!item) return null;
    if (status === 'realizado') {
      root.DB.run("UPDATE plano_tratamento_itens SET status='realizado',realizado_em=datetime('now','localtime'),atualizado_em=datetime('now','localtime') WHERE id=?", [item.id]);
      refreshPlanStatus(item.plano_id);
    } else if (status === 'cancelado') {
      root.DB.run("UPDATE plano_tratamento_itens SET status='planejado',agenda_id=NULL,atualizado_em=datetime('now','localtime') WHERE id=?", [item.id]);
    }
    return item.id;
  }

  function resolveAppointmentCharge(agendaId) {
    const item = root.DB.query(`SELECT i.*,p.paciente_id,p.titulo plano_titulo FROM plano_tratamento_itens i JOIN planos_tratamento p ON p.id=i.plano_id WHERE i.agenda_id=?`, [agendaId])[0];
    if (!item) return { handled: false };
    const budget = latestBudgetForPlan(item.plano_id);
    if (budget) {
      const budgetItem = root.DB.query('SELECT * FROM orcamento_odontologico_itens WHERE orcamento_id=? AND plano_item_id=?', [budget.id, item.id])[0];
      if (budgetItem?.status !== 'aprovado') return { handled: true, charge: null, reason: 'Item odontológico sem aprovação financeira.' };
      return { handled: true, charge: { amount: Number(budgetItem.valor_total || 0), description: `${budgetItem.descricao} — ${item.plano_titulo}`, procedureId: item.procedimento_id } };
    }
    return { handled: true, charge: { amount: Number(item.valor_total || 0), description: `${item.descricao} — ${item.plano_titulo}`, procedureId: item.procedimento_id } };
  }

  function generateBudget(planId) {
    if (!planId) return alert('Selecione um plano.');
    const items = root.DB.query("SELECT * FROM plano_tratamento_itens WHERE plano_id=? AND status!='cancelado' ORDER BY id", [planId]);
    if (!items.length) return alert('Adicione procedimentos ao plano antes de gerar um orçamento.');
    const plan = root.DB.query('SELECT * FROM planos_tratamento WHERE id=?', [planId])[0];
    const version = Number(root.DB.query('SELECT COALESCE(MAX(versao),0)+1 versao FROM orcamentos_odontologicos WHERE plano_id=?', [planId])[0]?.versao || 1);
    const gross = model.roundCurrency(items.reduce((sum, item) => sum + Number(item.quantidade || 0) * Number(item.valor_unitario || 0), 0));
    const discount = model.roundCurrency(items.reduce((sum, item) => sum + Number(item.desconto || 0), 0));
    const total = model.roundCurrency(items.reduce((sum, item) => sum + Number(item.valor_total || 0), 0));
    root.DB.run(`INSERT INTO orcamentos_odontologicos (plano_id,paciente_id,versao,valor_bruto,desconto,valor_total) VALUES (?,?,?,?,?,?)`, [planId, plan.paciente_id, version, gross, discount, total]);
    const budgetId = root.DB.getLastId();
    items.forEach(item => root.DB.run(`INSERT INTO orcamento_odontologico_itens (orcamento_id,plano_item_id,descricao,dente,face,quantidade,valor_unitario,desconto,valor_total) VALUES (?,?,?,?,?,?,?,?,?)`, [budgetId, item.id, item.descricao, item.dente || null, item.face || null, item.quantidade, item.valor_unitario, item.desconto, item.valor_total]));
    root.DB.run("UPDATE planos_tratamento SET status='proposto',atualizado_em=datetime('now','localtime') WHERE id=? AND status='rascunho'", [planId]);
    selectedBudgetId = budgetId;
    loadPlans();
    loadBudgets();
    activateTab('orcamento');
  }

  function syncBudgetCrm(budgetId) {
    const budget = root.DB.query(`SELECT o.*,p.titulo plano_titulo,pa.nome paciente FROM orcamentos_odontologicos o JOIN planos_tratamento p ON p.id=o.plano_id JOIN pacientes pa ON pa.id=o.paciente_id WHERE o.id=?`, [budgetId])[0];
    if (!budget) return null;
    let stage = 'aberta';
    if (budget.status === 'enviado') stage = 'proposta';
    if (budget.status === 'parcial') stage = 'aguardando';
    if (budget.status === 'aprovado') stage = 'ganha';
    if (budget.status === 'recusado' || budget.status === 'cancelado') stage = 'perdida';
    let opportunityId = budget.crm_oportunidade_id;
    if (!opportunityId) {
      root.DB.run(`INSERT INTO crm_oportunidades (paciente_id,tipo,titulo,valor,etapa,observacao) VALUES (?,?,?,?,?,?)`, [budget.paciente_id, 'odontologia', `Orçamento odontológico v${budget.versao} — ${budget.plano_titulo}`, budget.valor_total, stage, `Orçamento #${budget.id}`]);
      opportunityId = root.DB.getLastId();
      root.DB.run("UPDATE orcamentos_odontologicos SET crm_oportunidade_id=?,atualizado_em=datetime('now','localtime') WHERE id=?", [opportunityId, budget.id]);
    } else {
      root.DB.run("UPDATE crm_oportunidades SET valor=?,etapa=?,atualizado_em=datetime('now','localtime') WHERE id=?", [budget.valor_total, stage, opportunityId]);
    }
    return opportunityId;
  }

  function sendBudget(id) {
    root.DB.run("UPDATE orcamentos_odontologicos SET status='enviado',enviado_em=datetime('now','localtime'),atualizado_em=datetime('now','localtime') WHERE id=? AND status='rascunho'", [id]);
    const opportunityId = syncBudgetCrm(id);
    if (opportunityId) root.PlennusWhatsAppAutomation?.syncOpportunityMessage(opportunityId);
    selectedBudgetId = id;
    loadBudgets();
  }

  function decideBudgetItems(id, decision, all = false) {
    const selector = all ? [] : Array.from(document.querySelectorAll(`[data-budget-item="${id}"]:checked`)).map(input => Number(input.value));
    const rows = root.DB.query('SELECT id FROM orcamento_odontologico_itens WHERE orcamento_id=?', [id]);
    const targets = all ? rows.map(row => row.id) : selector;
    if (!targets.length) return alert('Selecione ao menos um item.');
    for (const itemId of targets) root.DB.run("UPDATE orcamento_odontologico_itens SET status=?,decidido_em=datetime('now','localtime') WHERE id=?", [decision, itemId]);
    const statuses = root.DB.query('SELECT status FROM orcamento_odontologico_itens WHERE orcamento_id=?', [id]).map(row => row.status);
    const status = model.deriveBudgetStatus(statuses);
    root.DB.run("UPDATE orcamentos_odontologicos SET status=?,decidido_em=datetime('now','localtime'),atualizado_em=datetime('now','localtime') WHERE id=?", [status, id]);
    const budget = root.DB.query('SELECT plano_id FROM orcamentos_odontologicos WHERE id=?', [id])[0];
    if (status === 'aprovado' || status === 'parcial') root.DB.run("UPDATE planos_tratamento SET status='aprovado',atualizado_em=datetime('now','localtime') WHERE id=? AND status NOT IN ('em_tratamento','concluido','cancelado')", [budget.plano_id]);
    syncBudgetCrm(id);
    loadPlans();
    loadBudgets();
  }

  function loadBudgets() {
    const list = document.getElementById('od-budget-list');
    const detail = document.getElementById('od-budget-detail');
    if (!list || !selectedPatientId) return;
    const rows = root.DB.query(`SELECT o.*,p.titulo plano_titulo FROM orcamentos_odontologicos o JOIN planos_tratamento p ON p.id=o.plano_id WHERE o.paciente_id=? ORDER BY o.id DESC`, [selectedPatientId]);
    list.innerHTML = rows.length ? rows.map(row => `<div class="budget-card ${selectedBudgetId === row.id ? 'active' : ''}" onclick="PlennusOdontology.selectBudget(${row.id})"><strong>v${row.versao} • ${root.escapeHTML(row.plano_titulo)}</strong><div>${root.formatMoney(Number(row.valor_total || 0))} • ${label(row.status)}</div></div>`).join('') : '<div class="odontology-empty">Nenhum orçamento.</div>';
    if (!selectedBudgetId && rows[0]) selectedBudgetId = rows[0].id;
    if (!rows.some(row => row.id === selectedBudgetId)) selectedBudgetId = rows[0]?.id || null;
    renderBudgetDetail();
    if (!selectedBudgetId && detail) detail.innerHTML = '<div class="odontology-empty">Selecione um orçamento.</div>';
  }

  function selectBudget(id) {
    selectedBudgetId = Number(id) || null;
    loadBudgets();
  }

  function renderBudgetDetail() {
    const container = document.getElementById('od-budget-detail');
    if (!container || !selectedBudgetId) return;
    const budget = root.DB.query(`SELECT o.*,p.titulo plano_titulo FROM orcamentos_odontologicos o JOIN planos_tratamento p ON p.id=o.plano_id WHERE o.id=?`, [selectedBudgetId])[0];
    if (!budget) return;
    const items = root.DB.query('SELECT * FROM orcamento_odontologico_itens WHERE orcamento_id=? ORDER BY id', [budget.id]);
    const actions = budget.status === 'rascunho'
      ? `<button class="btn btn-primary btn-sm" onclick="PlennusOdontology.sendBudget(${budget.id})">Marcar como enviado</button>`
      : ['enviado', 'parcial'].includes(budget.status)
        ? `<button class="btn btn-success btn-sm" onclick="PlennusOdontology.decideBudgetItems(${budget.id},'aprovado',false)">Aprovar selecionados</button> <button class="btn btn-success btn-sm" onclick="PlennusOdontology.decideBudgetItems(${budget.id},'aprovado',true)">Aprovar tudo</button> <button class="btn btn-danger btn-sm" onclick="PlennusOdontology.decideBudgetItems(${budget.id},'recusado',false)">Recusar selecionados</button>` : '';
    container.innerHTML = `<div><strong>${root.escapeHTML(budget.plano_titulo)} • versão ${budget.versao}</strong><div class="text-muted">${label(budget.status)} • Total ${root.formatMoney(Number(budget.valor_total || 0))}</div></div><div style="margin:12px 0">${actions}</div>${items.map(item => `<label class="budget-item-row"><input type="checkbox" data-budget-item="${budget.id}" value="${item.id}" ${item.status === 'pendente' ? '' : 'disabled'}><span><strong>${root.escapeHTML(item.descricao)}</strong><small class="text-muted">${item.dente ? ` Dente ${item.dente}${item.face ? ` / ${label(item.face)}` : ''}` : ''}</small></span><span>${root.formatMoney(Number(item.valor_total || 0))}</span><span>${label(item.status)}</span></label>`).join('')}`;
  }

  function carregarOdontologia() {
    ensureUi();
    if (!canAccess() || !root.DB?.isReady?.()) return;
    populatePatientSelect();
    populateProfessionalAndProcedureSelects();
    if (selectedPatientId) selectPatient(selectedPatientId);
  }

  const api = {
    ensureUi,
    carregarOdontologia,
    selectPatient,
    selectTooth,
    saveCondition,
    removeCondition,
    createPlan,
    selectPlan,
    addPlanItem,
    cancelPlanItem,
    prepareAppointment,
    onAppointmentCreated,
    onAppointmentStatusChanged,
    resolveAppointmentCharge,
    generateBudget,
    sendBudget,
    decideBudgetItems,
    selectBudget,
    canScheduleItem
  };

  root.PlennusOdontology = api;
  ensureUi();
})(typeof window !== 'undefined' ? window : globalThis);
