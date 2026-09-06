(function (root) {
  const model = root.PlennusOperationsModel;

  function canAccess() {
    const role = typeof currentUser !== 'undefined' ? currentUser?.nivel : null;
    return role === 'admin' || role === 'recepcao';
  }

  function ensureMenuItem() {
    const menu = document.getElementById('sidebar-menu');
    if (!menu || menu.querySelector('[data-page="financeiro"]')) return;
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.dataset.page = 'financeiro';
    item.dataset.roles = 'admin,recepcao';
    item.textContent = '▣  Financeiro';
    const before = menu.querySelector('[data-page="caixa"]') || menu.querySelector('[data-page="configuracoes"]');
    if (before) menu.insertBefore(item, before); else menu.appendChild(item);
  }

  function ensureFinanceUi() {
    ensureMenuItem();
    const main = document.querySelector('.main-content');
    if (!main || document.getElementById('page-financeiro')) return;
    const page = document.createElement('div');
    page.className = 'page';
    page.id = 'page-financeiro';
    page.innerHTML = `
      <div class="page-heading-row">
        <div><h1 class="page-title">Financeiro</h1><p class="text-muted">Contas a pagar e receber integradas ao caixa e aos repasses.</p></div>
      </div>
      <div class="operations-kpi-grid" id="fin-kpis"></div>
      <div class="operations-grid-2">
        <div class="card">
          <div class="card-title">Novo lançamento</div>
          <div class="form-row">
            <div class="form-group"><label>Tipo</label><select id="fin-tipo"><option value="receita">Receita</option><option value="despesa">Despesa</option></select></div>
            <div class="form-group" style="flex:2"><label>Descrição *</label><input id="fin-descricao" type="text" placeholder="Consulta, aluguel, material..."></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Categoria</label><select id="fin-categoria"></select></div>
            <div class="form-group"><label>Paciente</label><select id="fin-paciente"></select></div>
            <div class="form-group"><label>Profissional</label><select id="fin-profissional"></select></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Procedimento</label><select id="fin-procedimento"></select></div>
            <div class="form-group"><label>Valor *</label><input id="fin-valor" type="number" min="0" step="0.01" placeholder="0,00"></div>
            <div class="form-group"><label>Vencimento</label><input id="fin-vencimento" type="date"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Forma de pagamento</label><select id="fin-forma"></select></div>
            <div class="form-group" style="flex:2"><label>Observação</label><input id="fin-observacao" type="text"></div>
          </div>
          <div class="form-actions"><button id="fin-salvar" class="btn btn-primary btn-sm">Salvar lançamento</button></div>
        </div>
        <div class="card">
          <div class="card-title">Resumo por competência</div>
          <div id="fin-relatorio" class="operations-report-list"></div>
        </div>
      </div>
      <div class="card">
        <div class="operations-toolbar">
          <div class="card-title" style="margin:0">Lançamentos</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <select id="fin-filtro-status"><option value="">Todos</option><option value="pendente">Pendentes</option><option value="atrasado">Atrasados</option><option value="pago">Pagos</option><option value="cancelado">Cancelados</option></select>
            <select id="fin-filtro-tipo"><option value="">Receitas e despesas</option><option value="receita">Receitas</option><option value="despesa">Despesas</option></select>
          </div>
        </div>
        <div class="table-wrapper"><table><thead><tr><th>Vencimento</th><th>Tipo</th><th>Descrição</th><th>Paciente</th><th>Valor</th><th>Status</th><th>Pagamento</th><th>Ações</th></tr></thead><tbody id="fin-tabela"></tbody></table></div>
      </div>`;
    main.appendChild(page);
    page.querySelector('#fin-salvar').addEventListener('click', registrarLancamento);
    page.querySelector('#fin-filtro-status').addEventListener('change', carregarLancamentos);
    page.querySelector('#fin-filtro-tipo').addEventListener('change', carregarLancamentos);
    page.querySelector('#fin-tipo').addEventListener('change', carregarCategorias);
  }

  function paymentLabel(method) {
    const labels = {
      dinheiro: 'Dinheiro', pix: 'PIX', cartao_credito: 'Cartão crédito', cartao_debito: 'Cartão débito',
      boleto: 'Boleto', transferencia: 'Transferência', convenio: 'Convênio', outro: 'Outro'
    };
    return labels[method] || method || '-';
  }

  function statusBadge(status) {
    const map = {
      pago: ['Pago', 'status-ok'], pendente: ['Pendente', 'status-warn'], atrasado: ['Atrasado', 'status-danger'], cancelado: ['Cancelado', 'status-muted']
    };
    const [label, klass] = map[status] || [status, 'status-muted'];
    return `<span class="operations-status ${klass}">${escapeHTML(label)}</span>`;
  }

  function carregarSelectsFinanceiro() {
    const patient = document.getElementById('fin-paciente');
    const professional = document.getElementById('fin-profissional');
    const procedure = document.getElementById('fin-procedimento');
    const payment = document.getElementById('fin-forma');
    if (patient) {
      patient.innerHTML = '<option value="">Nenhum</option>' + DB.query('SELECT id,nome FROM pacientes WHERE ativo=1 ORDER BY nome')
        .map(row => `<option value="${row.id}">${escapeHTML(row.nome)}</option>`).join('');
    }
    if (professional) {
      professional.innerHTML = '<option value="">Nenhum</option>' + DB.query('SELECT id,nome FROM profissionais WHERE ativo=1 ORDER BY nome')
        .map(row => `<option value="${row.id}">${escapeHTML(row.nome)}</option>`).join('');
    }
    if (procedure) {
      procedure.innerHTML = '<option value="">Nenhum</option>' + DB.query('SELECT id,nome,valor_particular FROM procedimentos WHERE ativo=1 ORDER BY nome')
        .map(row => `<option value="${row.id}" data-value="${Number(row.valor_particular || 0)}">${escapeHTML(row.nome)} — ${formatMoney(Number(row.valor_particular || 0))}</option>`).join('');
      procedure.onchange = () => {
        const option = procedure.options[procedure.selectedIndex];
        const value = Number(option?.dataset?.value || 0);
        if (value > 0) document.getElementById('fin-valor').value = value.toFixed(2);
      };
    }
    if (payment) {
      payment.innerHTML = '<option value="">A definir</option>' + model.PAYMENT_METHODS.map(method => `<option value="${method}">${paymentLabel(method)}</option>`).join('');
    }
    const due = document.getElementById('fin-vencimento');
    if (due && !due.value) due.value = model.localIsoDate();
    carregarCategorias();
  }

  function carregarCategorias() {
    const select = document.getElementById('fin-categoria');
    if (!select) return;
    const type = document.getElementById('fin-tipo')?.value || 'receita';
    select.innerHTML = '<option value="">Sem categoria</option>' + DB.query('SELECT id,nome FROM financeiro_categorias WHERE ativo=1 AND tipo=? ORDER BY nome', [type])
      .map(row => `<option value="${row.id}">${escapeHTML(row.nome)}</option>`).join('');
  }

  function registrarLancamento() {
    if (!canAccess()) return alert('Acesso financeiro não autorizado.');
    const type = document.getElementById('fin-tipo').value;
    const description = document.getElementById('fin-descricao').value.trim();
    const amount = model.roundCurrency(document.getElementById('fin-valor').value);
    if (!description) return alert('Informe a descrição do lançamento.');
    if (amount <= 0) return alert('Informe um valor maior que zero.');
    const due = document.getElementById('fin-vencimento').value || null;
    const competence = due ? due.slice(0, 7) : model.localIsoDate().slice(0, 7);
    DB.run(`INSERT INTO financeiro_lancamentos
      (tipo,descricao,categoria_id,paciente_id,profissional_id,procedimento_id,valor,vencimento_em,competencia,forma_pagamento,observacao)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
      type, description,
      document.getElementById('fin-categoria').value || null,
      document.getElementById('fin-paciente').value || null,
      document.getElementById('fin-profissional').value || null,
      document.getElementById('fin-procedimento').value || null,
      amount, due, competence,
      document.getElementById('fin-forma').value || null,
      document.getElementById('fin-observacao').value.trim() || null
    ]);
    document.getElementById('fin-descricao').value = '';
    document.getElementById('fin-valor').value = '';
    document.getElementById('fin-observacao').value = '';
    carregarFinanceiroAvancado();
  }

  function ensureCashLink(entry) {
    const linked = DB.query('SELECT caixa_id FROM financeiro_caixa_links WHERE financeiro_lancamento_id=?', [entry.id])[0];
    if (linked) return linked.caixa_id;
    DB.run('INSERT INTO caixa (tipo,descricao,valor,forma_pagamento,data,observacao) VALUES (?,?,?,?,?,?)', [
      entry.tipo === 'receita' ? 'entrada' : 'saida',
      `[Financeiro] ${entry.descricao}`,
      Number(entry.valor || 0),
      entry.forma_pagamento || 'outro',
      entry.pago_em || model.localIsoDate(),
      `Lançamento financeiro #${entry.id}`
    ]);
    const cashId = DB.getLastId();
    DB.run('INSERT INTO financeiro_caixa_links (financeiro_lancamento_id,caixa_id) VALUES (?,?)', [entry.id, cashId]);
    return cashId;
  }

  function ensurePayout(entry) {
    if (entry.tipo !== 'receita' || !entry.profissional_id) return null;
    const linked = DB.query('SELECT repasse_id FROM financeiro_repasse_links WHERE financeiro_lancamento_id=?', [entry.id])[0];
    if (linked) return linked.repasse_id;
    const professional = DB.query('SELECT percentual_repasse FROM profissionais WHERE id=?', [entry.profissional_id])[0];
    const percent = Number(professional?.percentual_repasse || 0);
    const payout = model.calculatePayout(entry.valor, percent);
    if (payout <= 0) return null;
    const paidDate = entry.pago_em || model.localIsoDate();
    DB.run(`INSERT INTO repasses (profissional_id,periodo_inicio,periodo_fim,valor_bruto,percentual,valor_repasse,status)
      VALUES (?,?,?,?,?,?,?)`, [entry.profissional_id, paidDate, paidDate, entry.valor, percent, payout, 'pendente']);
    const payoutId = DB.getLastId();
    DB.run('INSERT INTO financeiro_repasse_links (financeiro_lancamento_id,repasse_id) VALUES (?,?)', [entry.id, payoutId]);
    return payoutId;
  }

  function liquidarLancamento(id) {
    if (!canAccess()) return alert('Acesso financeiro não autorizado.');
    const entry = DB.query('SELECT * FROM financeiro_lancamentos WHERE id=?', [id])[0];
    if (!entry || entry.status === 'cancelado') return;
    if (entry.status !== 'pago') {
      const method = entry.forma_pagamento || prompt('Forma de pagamento: dinheiro, pix, cartao_credito, cartao_debito, boleto, transferencia, convenio ou outro', 'pix') || 'outro';
      const safeMethod = model.PAYMENT_METHODS.includes(method) ? method : 'outro';
      DB.run(`UPDATE financeiro_lancamentos SET status='pago',forma_pagamento=?,pago_em=?,atualizado_em=datetime('now','localtime') WHERE id=?`, [
        safeMethod, model.localIsoDate(), id
      ]);
    }
    const settled = DB.query('SELECT * FROM financeiro_lancamentos WHERE id=?', [id])[0];
    ensureCashLink(settled);
    ensurePayout(settled);
    root.PlennusWhatsAppAutomation?.syncFinancialMessage(id);
    carregarFinanceiroAvancado();
  }

  function cancelarLancamento(id) {
    if (!canAccess()) return alert('Acesso financeiro não autorizado.');
    const entry = DB.query('SELECT status FROM financeiro_lancamentos WHERE id=?', [id])[0];
    if (!entry) return;
    if (entry.status === 'pago') return alert('Lançamento pago não pode ser cancelado automaticamente. Faça a reversão financeira manual para preservar auditoria.');
    if (!confirm('Cancelar este lançamento?')) return;
    DB.run(`UPDATE financeiro_lancamentos SET status='cancelado',atualizado_em=datetime('now','localtime') WHERE id=?`, [id]);
    carregarFinanceiroAvancado();
  }

  function ensureReceivableForAppointment(agendaId) {
    const appointment = DB.query(`
      SELECT a.id,a.paciente_id,a.profissional_id,a.procedimento_id,a.data,p.nome paciente,pr.nome profissional,
             proc.nome procedimento,proc.valor_particular
      FROM agenda a
      LEFT JOIN pacientes p ON p.id=a.paciente_id
      LEFT JOIN profissionais pr ON pr.id=a.profissional_id
      LEFT JOIN procedimentos proc ON proc.id=a.procedimento_id
      WHERE a.id=?`, [agendaId])[0];
    if (!appointment?.procedimento_id || Number(appointment.valor_particular || 0) <= 0) return null;
    const key = `agenda:${agendaId}:receita`;
    const existing = DB.query('SELECT id FROM financeiro_lancamentos WHERE chave_origem=?', [key])[0];
    if (existing) return existing.id;
    const category = DB.query("SELECT id FROM financeiro_categorias WHERE nome='Procedimentos' AND tipo='receita' LIMIT 1")[0];
    const due = model.brDateToIso(appointment.data) || model.localIsoDate();
    DB.run(`INSERT INTO financeiro_lancamentos
      (tipo,descricao,categoria_id,paciente_id,profissional_id,agenda_id,procedimento_id,chave_origem,valor,vencimento_em,competencia,status)
      VALUES ('receita',?,?,?,?,?,?,?,?,?,?, 'pendente')`, [
      `${appointment.procedimento || 'Procedimento'} — ${appointment.paciente || 'Paciente'}`,
      category?.id || null, appointment.paciente_id || null, appointment.profissional_id || null,
      agendaId, appointment.procedimento_id, key, Number(appointment.valor_particular || 0), due, due.slice(0, 7)
    ]);
    return DB.getLastId();
  }

  function onAppointmentStatusChanged(agendaId, status) {
    const key = `agenda:${agendaId}:receita`;
    if (status === 'realizado') return ensureReceivableForAppointment(agendaId);
    if (status === 'cancelado') {
      DB.run(`UPDATE financeiro_lancamentos SET status='cancelado',atualizado_em=datetime('now','localtime') WHERE chave_origem=? AND status='pendente'`, [key]);
    }
    return null;
  }

  function carregarKpis() {
    const today = model.localIsoDate();
    const month = today.slice(0, 7);
    const rows = DB.query('SELECT tipo,valor,status,vencimento_em,pago_em FROM financeiro_lancamentos');
    let receivable = 0, payable = 0, received = 0, paid = 0, overdue = 0;
    rows.forEach(row => {
      const value = Number(row.valor || 0);
      const classified = model.classifyFinancialStatus(row, today);
      if (row.status === 'pendente' && row.tipo === 'receita') receivable += value;
      if (row.status === 'pendente' && row.tipo === 'despesa') payable += value;
      if (classified === 'atrasado') overdue += value;
      if (row.status === 'pago' && String(row.pago_em || '').startsWith(month)) {
        if (row.tipo === 'receita') received += value; else paid += value;
      }
    });
    const container = document.getElementById('fin-kpis');
    if (!container) return;
    container.innerHTML = `
      <div class="operations-kpi"><span>A receber</span><strong>${formatMoney(receivable)}</strong></div>
      <div class="operations-kpi"><span>A pagar</span><strong>${formatMoney(payable)}</strong></div>
      <div class="operations-kpi"><span>Recebido no mês</span><strong>${formatMoney(received)}</strong></div>
      <div class="operations-kpi"><span>Pago no mês</span><strong>${formatMoney(paid)}</strong></div>
      <div class="operations-kpi"><span>Em atraso</span><strong>${formatMoney(overdue)}</strong></div>`;
  }

  function carregarLancamentos() {
    const body = document.getElementById('fin-tabela');
    if (!body) return;
    const statusFilter = document.getElementById('fin-filtro-status')?.value || '';
    const typeFilter = document.getElementById('fin-filtro-tipo')?.value || '';
    const today = model.localIsoDate();
    let rows = DB.query(`SELECT f.*,p.nome paciente,c.nome categoria
      FROM financeiro_lancamentos f
      LEFT JOIN pacientes p ON p.id=f.paciente_id
      LEFT JOIN financeiro_categorias c ON c.id=f.categoria_id
      ORDER BY COALESCE(f.vencimento_em,f.criado_em) DESC,f.id DESC LIMIT 250`);
    rows = rows.filter(row => {
      const classified = model.classifyFinancialStatus(row, today);
      return (!statusFilter || classified === statusFilter) && (!typeFilter || row.tipo === typeFilter);
    });
    body.innerHTML = rows.length ? rows.map(row => {
      const classified = model.classifyFinancialStatus(row, today);
      const actions = row.status === 'pendente'
        ? `<button class="btn btn-success btn-sm" onclick="PlennusFinanceAdvanced.liquidarLancamento(${row.id})">Dar baixa</button> <button class="btn btn-danger btn-sm" onclick="PlennusFinanceAdvanced.cancelarLancamento(${row.id})">Cancelar</button>`
        : '';
      return `<tr>
        <td>${escapeHTML(row.vencimento_em || '-')}</td><td>${row.tipo === 'receita' ? 'Receita' : 'Despesa'}</td>
        <td><strong>${escapeHTML(row.descricao)}</strong><br><small class="text-muted">${escapeHTML(row.categoria || '')}</small></td>
        <td>${escapeHTML(row.paciente || '-')}</td><td>${formatMoney(Number(row.valor || 0))}</td>
        <td>${statusBadge(classified)}</td><td>${escapeHTML(paymentLabel(row.forma_pagamento))}</td><td>${actions}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" class="text-muted" style="text-align:center;padding:24px">Nenhum lançamento.</td></tr>';
  }

  function carregarRelatorio() {
    const container = document.getElementById('fin-relatorio');
    if (!container) return;
    const rows = DB.query(`SELECT COALESCE(competencia,substr(COALESCE(pago_em,vencimento_em,criado_em),1,7)) competencia,
      SUM(CASE WHEN tipo='receita' AND status='pago' THEN valor ELSE 0 END) receitas,
      SUM(CASE WHEN tipo='despesa' AND status='pago' THEN valor ELSE 0 END) despesas
      FROM financeiro_lancamentos GROUP BY competencia ORDER BY competencia DESC LIMIT 6`);
    container.innerHTML = rows.length ? rows.map(row => {
      const result = Number(row.receitas || 0) - Number(row.despesas || 0);
      return `<div class="operations-report-row"><span>${escapeHTML(row.competencia || '-')}</span><span>Receitas ${formatMoney(Number(row.receitas || 0))}</span><span>Despesas ${formatMoney(Number(row.despesas || 0))}</span><strong>${formatMoney(result)}</strong></div>`;
    }).join('') : '<div class="text-muted">Sem movimentação financeira consolidada.</div>';
  }

  function carregarFinanceiroAvancado() {
    ensureFinanceUi();
    if (!canAccess()) return;
    carregarSelectsFinanceiro();
    carregarKpis();
    carregarLancamentos();
    carregarRelatorio();
  }

  const api = {
    ensureFinanceUi,
    carregarFinanceiroAvancado,
    registrarLancamento,
    liquidarLancamento,
    cancelarLancamento,
    ensureReceivableForAppointment,
    onAppointmentStatusChanged,
    ensureCashLink,
    ensurePayout
  };
  root.PlennusFinanceAdvanced = api;
  ensureFinanceUi();
})(typeof window !== 'undefined' ? window : globalThis);
