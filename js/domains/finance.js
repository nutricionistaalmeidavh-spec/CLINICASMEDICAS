function financeRole() {
  return typeof currentUser !== 'undefined' ? currentUser?.nivel || null : null;
}

function canManageCash() {
  return financeRole() === 'admin' || financeRole() === 'recepcao';
}

function canManagePayouts() {
  const access = window.PlennusAccessControl;
  return typeof access?.canManagePayouts === 'function' ? access.canManagePayouts(financeRole()) : financeRole() === 'admin';
}

function carregarCaixa() {
  if (!canManageCash()) return;
  const rows = DB.query('SELECT * FROM caixa ORDER BY data DESC LIMIT 100');
  let entradas = 0, saidas = 0;
  document.getElementById('tabela-caixa').innerHTML = rows.map(r => {
    if (r.tipo === 'entrada') entradas += r.valor; else saidas += r.valor;
    return `<tr>
      <td>${r.id}</td><td>${escapeHTML(r.data)}</td><td>${escapeHTML(r.tipo.toUpperCase())}</td>
      <td>${escapeHTML(r.descricao)}</td><td>${formatMoney(r.valor)}</td><td>${escapeHTML(r.forma_pagamento)}</td>
    </tr>`;
  }).join('');
  document.getElementById('cx-entradas').textContent = formatMoney(entradas);
  document.getElementById('cx-saidas').textContent = formatMoney(saidas);
  document.getElementById('cx-saldo').textContent = formatMoney(entradas - saidas);
}

function registrarCaixa() {
  if (!canManageCash()) return alert('Acesso ao caixa não autorizado.');
  const desc = document.getElementById('cx-desc').value.trim();
  const valorStr = document.getElementById('cx-valor').value.replace(',', '.');
  if (!desc || !valorStr) return alert('Preencha descrição e valor.');
  const valor = parseFloat(valorStr);
  if (isNaN(valor)) return alert('Valor inválido.');
  DB.run('INSERT INTO caixa (tipo,descricao,valor,forma_pagamento) VALUES (?,?,?,?)',
    [document.getElementById('cx-tipo').value, desc, valor, document.getElementById('cx-forma').value]);
  document.getElementById('cx-desc').value = '';
  document.getElementById('cx-valor').value = '';
  carregarCaixa();
  alert('Lançamento registrado!');
}

function carregarSelectsRepasse() {
  if (!canManagePayouts()) return;
  const profs = DB.query('SELECT id, nome FROM profissionais WHERE ativo=1 ORDER BY nome');
  document.getElementById('rep-prof').innerHTML = profs.map(p => `<option value="${p.id}">${p.nome}</option>`).join('') || '<option>Nenhum</option>';
}

function carregarRepasses() {
  if (!canManagePayouts()) return;
  const rows = DB.query(`
    SELECT r.*, p.nome as profissional FROM repasses r
    LEFT JOIN profissionais p ON p.id=r.profissional_id ORDER BY r.criado_em DESC`);
  document.getElementById('tabela-repasses').innerHTML = rows.map(r => `
    <tr onclick="selectedRepasseId=${r.id}" style="cursor:pointer">
      <td>${r.id}</td><td>${escapeHTML(r.profissional)}</td>
      <td>${escapeHTML(r.periodo_inicio)} a ${escapeHTML(r.periodo_fim)}</td>
      <td>${formatMoney(r.valor_bruto)}</td><td>${r.percentual}%</td>
      <td>${formatMoney(r.valor_repasse)}</td>
      <td>${escapeHTML(r.status.toUpperCase())}</td><td>${escapeHTML(r.data_pagamento || '-')}</td>
    </tr>`).join('');
}

function registrarRepasse() {
  if (!canManagePayouts()) return alert('Apenas administradores podem registrar repasses.');
  const pid = document.getElementById('rep-prof').value;
  if (!pid) return alert('Selecione um profissional.');
  const bruto = parseFloat((document.getElementById('rep-bruto').value || '0').replace(',', '.'));
  const perc = parseFloat(document.getElementById('rep-perc').value) || 30;
  if (!bruto) return alert('Informe o valor bruto.');
  const repasse = bruto * (perc / 100);
  DB.run(`INSERT INTO repasses (profissional_id,periodo_inicio,periodo_fim,valor_bruto,percentual,valor_repasse)
    VALUES (?,?,?,?,?,?)`, [
    pid, document.getElementById('rep-inicio').value, document.getElementById('rep-fim').value,
    bruto, perc, repasse
  ]);
  alert(`Repasse registrado!\nValor a pagar: ${formatMoney(repasse)}`);
  document.getElementById('rep-bruto').value = '';
  carregarRepasses();
}

function marcarRepassePago() {
  if (!canManagePayouts()) return alert('Apenas administradores podem liquidar repasses.');
  if (!selectedRepasseId) return alert('Selecione um repasse na tabela.');
  DB.run('UPDATE repasses SET status=?, data_pagamento=? WHERE id=?', ['pago', hoje(), selectedRepasseId]);
  selectedRepasseId = null;
  carregarRepasses();
  alert('Marcado como pago com sucesso!');
}
