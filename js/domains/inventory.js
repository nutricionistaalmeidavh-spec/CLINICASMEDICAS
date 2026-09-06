(function (root) {
  const model = root.PlennusOperationsModel;

  function canAccess() {
    const role = typeof currentUser !== 'undefined' ? currentUser?.nivel : null;
    return role === 'admin' || role === 'recepcao';
  }

  function ensureMenuItem() {
    const menu = document.getElementById('sidebar-menu');
    if (!menu || menu.querySelector('[data-page="estoque"]')) return;
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.dataset.page = 'estoque';
    item.dataset.roles = 'admin,recepcao';
    item.textContent = '▤  Estoque';
    const before = menu.querySelector('[data-page="caixa"]') || menu.querySelector('[data-page="configuracoes"]');
    if (before) menu.insertBefore(item, before); else menu.appendChild(item);
  }

  function ensureInventoryUi() {
    ensureMenuItem();
    const main = document.querySelector('.main-content');
    if (!main || document.getElementById('page-estoque')) return;
    const page = document.createElement('div');
    page.className = 'page';
    page.id = 'page-estoque';
    page.innerHTML = `
      <div class="page-heading-row"><div><h1 class="page-title">Estoque clínico</h1><p class="text-muted">Insumos, lotes, validade, estoque mínimo e consumo por procedimento.</p></div></div>
      <div class="operations-kpi-grid" id="estoque-kpis"></div>
      <div class="operations-grid-2">
        <div class="card">
          <div class="card-title">Cadastrar insumo</div>
          <div class="form-row">
            <div class="form-group" style="flex:2"><label>Nome *</label><input id="est-item-nome" type="text"></div>
            <div class="form-group"><label>Código</label><input id="est-item-codigo" type="text"></div>
            <div class="form-group"><label>Unidade</label><input id="est-item-unidade" type="text" value="un"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Fabricante</label><input id="est-item-fabricante" type="text"></div>
            <div class="form-group"><label>Estoque inicial</label><input id="est-item-inicial" type="number" min="0" step="0.001" value="0"></div>
            <div class="form-group"><label>Estoque mínimo</label><input id="est-item-minimo" type="number" min="0" step="0.001" value="0"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Lote inicial</label><input id="est-item-lote" type="text"></div>
            <div class="form-group"><label>Validade</label><input id="est-item-validade" type="date"></div>
          </div>
          <div class="form-actions"><button class="btn btn-primary btn-sm" id="est-item-salvar">Cadastrar insumo</button></div>
        </div>
        <div class="card">
          <div class="card-title">Movimentar estoque</div>
          <div class="form-row">
            <div class="form-group" style="flex:2"><label>Insumo</label><select id="est-mov-item"></select></div>
            <div class="form-group"><label>Movimento</label><select id="est-mov-tipo"><option value="entrada">Entrada</option><option value="saida">Saída</option><option value="ajuste">Ajuste para quantidade</option></select></div>
            <div class="form-group"><label>Quantidade</label><input id="est-mov-quantidade" type="number" min="0" step="0.001"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Lote</label><input id="est-mov-lote" type="text"></div>
            <div class="form-group"><label>Validade</label><input id="est-mov-validade" type="date"></div>
            <div class="form-group" style="flex:2"><label>Motivo</label><input id="est-mov-motivo" type="text" placeholder="Compra, uso interno, perda..."></div>
          </div>
          <div class="form-actions"><button class="btn btn-primary btn-sm" id="est-mov-salvar">Registrar movimento</button></div>
        </div>
      </div>
      <div class="operations-grid-2">
        <div class="card">
          <div class="card-title">Consumo por procedimento</div>
          <p class="text-muted" style="margin-bottom:12px">Ao concluir uma consulta com procedimento vinculado, o consumo configurado é baixado uma única vez.</p>
          <div class="form-row">
            <div class="form-group"><label>Procedimento</label><select id="est-map-procedimento"></select></div>
            <div class="form-group"><label>Insumo</label><select id="est-map-item"></select></div>
            <div class="form-group"><label>Quantidade</label><input id="est-map-quantidade" type="number" min="0.001" step="0.001"></div>
          </div>
          <div class="form-actions"><button class="btn btn-primary btn-sm" id="est-map-salvar">Salvar consumo</button></div>
          <div class="table-wrapper" style="margin-top:12px"><table><thead><tr><th>Procedimento</th><th>Insumo</th><th>Qtd.</th><th></th></tr></thead><tbody id="est-map-tabela"></tbody></table></div>
        </div>
        <div class="card">
          <div class="card-title">Movimentos recentes</div>
          <div class="table-wrapper"><table><thead><tr><th>Data</th><th>Insumo</th><th>Tipo</th><th>Qtd.</th><th>Saldo</th><th>Lote/validade</th></tr></thead><tbody id="est-mov-tabela"></tbody></table></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Insumos</div>
        <div class="table-wrapper"><table><thead><tr><th>Código</th><th>Insumo</th><th>Fabricante</th><th>Unidade</th><th>Atual</th><th>Mínimo</th><th>Status</th></tr></thead><tbody id="est-item-tabela"></tbody></table></div>
      </div>`;
    main.appendChild(page);
    page.querySelector('#est-item-salvar').addEventListener('click', cadastrarItem);
    page.querySelector('#est-mov-salvar').addEventListener('click', registrarMovimento);
    page.querySelector('#est-map-salvar').addEventListener('click', salvarConsumoProcedimento);
  }

  function cadastrarItem() {
    if (!canAccess()) return alert('Acesso ao estoque não autorizado.');
    const name = document.getElementById('est-item-nome').value.trim();
    if (!name) return alert('Informe o nome do insumo.');
    const initial = Math.max(0, model.toFiniteNumber(document.getElementById('est-item-inicial').value));
    const minimum = Math.max(0, model.toFiniteNumber(document.getElementById('est-item-minimo').value));
    try {
      DB.run(`INSERT INTO estoque_itens (nome,codigo,unidade,fabricante,estoque_atual,estoque_minimo) VALUES (?,?,?,?,?,?)`, [
        name,
        document.getElementById('est-item-codigo').value.trim() || null,
        document.getElementById('est-item-unidade').value.trim() || 'un',
        document.getElementById('est-item-fabricante').value.trim() || null,
        initial, minimum
      ]);
      const itemId = DB.getLastId();
      if (initial > 0) {
        DB.run(`INSERT INTO estoque_movimentos
          (item_id,tipo,quantidade,delta,estoque_antes,estoque_depois,lote,validade,motivo,chave_origem)
          VALUES (?,?,?,?,?,?,?,?,?,?)`, [
          itemId, 'entrada', initial, initial, 0, initial,
          document.getElementById('est-item-lote').value.trim() || null,
          document.getElementById('est-item-validade').value || null,
          'Estoque inicial', `estoque-inicial:${itemId}`
        ]);
      }
      ['est-item-nome','est-item-codigo','est-item-fabricante','est-item-lote','est-item-validade'].forEach(id => { document.getElementById(id).value = ''; });
      document.getElementById('est-item-inicial').value = '0';
      document.getElementById('est-item-minimo').value = '0';
      carregarEstoque();
    } catch (error) {
      alert(error.message?.includes('UNIQUE') ? 'Já existe um insumo com esse código.' : `Não foi possível cadastrar: ${error.message}`);
    }
  }

  function applyMovement(item, type, quantity, metadata = {}) {
    const movement = model.computeStockMovement({ type, current: item.estoque_atual, quantity });
    DB.run(`UPDATE estoque_itens SET estoque_atual=?,atualizado_em=datetime('now','localtime') WHERE id=?`, [movement.after, item.id]);
    DB.run(`INSERT INTO estoque_movimentos
      (item_id,tipo,quantidade,delta,estoque_antes,estoque_depois,lote,validade,motivo,paciente_id,procedimento_id,agenda_id,chave_origem)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      item.id, metadata.recordType || type, movement.quantity, movement.delta, movement.before, movement.after,
      metadata.lote || null, metadata.validade || null, metadata.motivo || null,
      metadata.pacienteId || null, metadata.procedimentoId || null, metadata.agendaId || null, metadata.chaveOrigem || null
    ]);
    return movement;
  }

  function registrarMovimento() {
    if (!canAccess()) return alert('Acesso ao estoque não autorizado.');
    const itemId = document.getElementById('est-mov-item').value;
    const item = DB.query('SELECT * FROM estoque_itens WHERE id=? AND ativo=1', [itemId])[0];
    if (!item) return alert('Selecione um insumo.');
    try {
      applyMovement(item, document.getElementById('est-mov-tipo').value, document.getElementById('est-mov-quantidade').value, {
        lote: document.getElementById('est-mov-lote').value.trim(),
        validade: document.getElementById('est-mov-validade').value,
        motivo: document.getElementById('est-mov-motivo').value.trim() || 'Movimentação manual'
      });
      document.getElementById('est-mov-quantidade').value = '';
      document.getElementById('est-mov-lote').value = '';
      document.getElementById('est-mov-validade').value = '';
      document.getElementById('est-mov-motivo').value = '';
      carregarEstoque();
    } catch (error) {
      alert(error.message);
    }
  }

  function salvarConsumoProcedimento() {
    if (!canAccess()) return alert('Acesso ao estoque não autorizado.');
    const procedureId = document.getElementById('est-map-procedimento').value;
    const itemId = document.getElementById('est-map-item').value;
    const quantity = model.toFiniteNumber(document.getElementById('est-map-quantidade').value);
    if (!procedureId || !itemId || quantity <= 0) return alert('Informe procedimento, insumo e quantidade.');
    DB.run(`INSERT INTO procedimento_estoque (procedimento_id,item_id,quantidade,ativo) VALUES (?,?,?,1)
      ON CONFLICT(procedimento_id,item_id) DO UPDATE SET quantidade=excluded.quantidade,ativo=1`, [procedureId, itemId, quantity]);
    document.getElementById('est-map-quantidade').value = '';
    carregarMapeamentos();
  }

  function removerConsumoProcedimento(id) {
    if (!canAccess()) return;
    DB.run('UPDATE procedimento_estoque SET ativo=0 WHERE id=?', [id]);
    carregarMapeamentos();
  }

  function consumeForAppointment(agendaId) {
    const appointment = DB.query('SELECT id,paciente_id,procedimento_id FROM agenda WHERE id=?', [agendaId])[0];
    if (!appointment?.procedimento_id) return { consumed: 0, warnings: [] };
    const mappings = DB.query(`SELECT pe.*,ei.nome,ei.estoque_atual FROM procedimento_estoque pe
      JOIN estoque_itens ei ON ei.id=pe.item_id
      WHERE pe.procedimento_id=? AND pe.ativo=1 AND ei.ativo=1`, [appointment.procedimento_id]);
    let consumed = 0;
    const warnings = [];
    mappings.forEach(mapping => {
      const originKey = `agenda:${agendaId}:item:${mapping.item_id}`;
      const existing = DB.query('SELECT id FROM estoque_movimentos WHERE chave_origem=?', [originKey])[0];
      if (existing) return;
      const item = DB.query('SELECT * FROM estoque_itens WHERE id=?', [mapping.item_id])[0];
      try {
        applyMovement(item, 'saida', mapping.quantidade, {
          recordType: 'saida_procedimento',
          motivo: `Consumo automático do procedimento #${appointment.procedimento_id}`,
          pacienteId: appointment.paciente_id,
          procedimentoId: appointment.procedimento_id,
          agendaId,
          chaveOrigem: originKey
        });
        consumed += 1;
      } catch (error) {
        warnings.push(`${mapping.nome}: ${error.message}`);
        root.PlennusAudit?.log({
          acao: 'estoque_insuficiente', entidade: 'estoque_itens', entidadeId: mapping.item_id,
          contexto: { agendaId, procedimentoId: appointment.procedimento_id, quantidade: mapping.quantidade }
        });
      }
    });
    if (warnings.length && typeof alert === 'function') alert(`Atendimento concluído, mas houve pendência de estoque:\n${warnings.join('\n')}`);
    return { consumed, warnings };
  }

  function carregarSelects() {
    const items = DB.query('SELECT id,nome,estoque_atual,unidade FROM estoque_itens WHERE ativo=1 ORDER BY nome');
    const itemOptions = '<option value="">Selecione</option>' + items.map(row => `<option value="${row.id}">${escapeHTML(row.nome)} (${row.estoque_atual} ${escapeHTML(row.unidade || 'un')})</option>`).join('');
    const mov = document.getElementById('est-mov-item');
    const mapItem = document.getElementById('est-map-item');
    if (mov) mov.innerHTML = itemOptions;
    if (mapItem) mapItem.innerHTML = itemOptions;
    const procedures = document.getElementById('est-map-procedimento');
    if (procedures) procedures.innerHTML = '<option value="">Selecione</option>' + DB.query('SELECT id,nome FROM procedimentos WHERE ativo=1 ORDER BY nome')
      .map(row => `<option value="${row.id}">${escapeHTML(row.nome)}</option>`).join('');
  }

  function carregarItens() {
    const body = document.getElementById('est-item-tabela');
    if (!body) return;
    const rows = DB.query('SELECT * FROM estoque_itens WHERE ativo=1 ORDER BY nome');
    body.innerHTML = rows.length ? rows.map(row => {
      const low = Number(row.estoque_atual || 0) <= Number(row.estoque_minimo || 0);
      return `<tr><td>${escapeHTML(row.codigo || '-')}</td><td><strong>${escapeHTML(row.nome)}</strong></td><td>${escapeHTML(row.fabricante || '-')}</td><td>${escapeHTML(row.unidade || 'un')}</td><td>${row.estoque_atual}</td><td>${row.estoque_minimo}</td><td><span class="operations-status ${low ? 'status-danger' : 'status-ok'}">${low ? 'Repor' : 'OK'}</span></td></tr>`;
    }).join('') : '<tr><td colspan="7" class="text-muted" style="text-align:center;padding:24px">Nenhum insumo cadastrado.</td></tr>';
  }

  function carregarMovimentos() {
    const body = document.getElementById('est-mov-tabela');
    if (!body) return;
    const rows = DB.query(`SELECT m.*,i.nome,i.unidade FROM estoque_movimentos m JOIN estoque_itens i ON i.id=m.item_id ORDER BY m.id DESC LIMIT 80`);
    body.innerHTML = rows.length ? rows.map(row => `<tr>
      <td>${escapeHTML(row.criado_em || '-')}</td><td>${escapeHTML(row.nome)}</td><td>${escapeHTML(row.tipo)}</td>
      <td>${row.delta > 0 ? '+' : ''}${row.delta} ${escapeHTML(row.unidade || 'un')}</td><td>${row.estoque_depois}</td>
      <td>${escapeHTML(row.lote || '-')}${row.validade ? `<br><small>${escapeHTML(row.validade)}</small>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:18px">Sem movimentos.</td></tr>';
  }

  function carregarMapeamentos() {
    const body = document.getElementById('est-map-tabela');
    if (!body) return;
    const rows = DB.query(`SELECT pe.id,pe.quantidade,p.nome procedimento,i.nome item,i.unidade FROM procedimento_estoque pe
      JOIN procedimentos p ON p.id=pe.procedimento_id JOIN estoque_itens i ON i.id=pe.item_id WHERE pe.ativo=1 ORDER BY p.nome,i.nome`);
    body.innerHTML = rows.length ? rows.map(row => `<tr><td>${escapeHTML(row.procedimento)}</td><td>${escapeHTML(row.item)}</td><td>${row.quantidade} ${escapeHTML(row.unidade || 'un')}</td><td><button class="btn btn-danger btn-sm" onclick="PlennusInventory.removerConsumoProcedimento(${row.id})">Remover</button></td></tr>`).join('')
      : '<tr><td colspan="4" class="text-muted" style="text-align:center;padding:18px">Nenhum consumo configurado.</td></tr>';
  }

  function carregarKpis() {
    const items = DB.query('SELECT estoque_atual,estoque_minimo FROM estoque_itens WHERE ativo=1');
    const low = items.filter(row => Number(row.estoque_atual || 0) <= Number(row.estoque_minimo || 0)).length;
    const month = model.localIsoDate().slice(0, 7);
    const movements = DB.query('SELECT COUNT(*) c FROM estoque_movimentos WHERE substr(criado_em,1,7)=?', [month])[0]?.c || 0;
    const mapped = DB.query('SELECT COUNT(*) c FROM procedimento_estoque WHERE ativo=1')[0]?.c || 0;
    const container = document.getElementById('estoque-kpis');
    if (container) container.innerHTML = `
      <div class="operations-kpi"><span>Insumos ativos</span><strong>${items.length}</strong></div>
      <div class="operations-kpi"><span>Abaixo do mínimo</span><strong>${low}</strong></div>
      <div class="operations-kpi"><span>Movimentos no mês</span><strong>${movements}</strong></div>
      <div class="operations-kpi"><span>Consumos configurados</span><strong>${mapped}</strong></div>`;
  }

  function carregarEstoque() {
    ensureInventoryUi();
    if (!canAccess()) return;
    carregarSelects();
    carregarItens();
    carregarMovimentos();
    carregarMapeamentos();
    carregarKpis();
  }

  const api = {
    ensureInventoryUi,
    carregarEstoque,
    cadastrarItem,
    registrarMovimento,
    salvarConsumoProcedimento,
    removerConsumoProcedimento,
    consumeForAppointment,
    applyMovement
  };
  root.PlennusInventory = api;
  ensureInventoryUi();
})(typeof window !== 'undefined' ? window : globalThis);
