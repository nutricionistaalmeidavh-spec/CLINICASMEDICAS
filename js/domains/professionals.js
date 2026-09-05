function carregarProfissionais() {
  const rows = DB.query('SELECT * FROM profissionais WHERE ativo=1 ORDER BY nome');
  document.getElementById('tabela-profissionais').innerHTML = rows.map(r => `
    <tr onclick="selecionarProfissional(${r.id})" style="cursor:pointer">
      <td>${r.id}</td>
      <td><strong>${escapeHTML(r.nome)}</strong></td>
      <td>${escapeHTML(r.especialidade || '-')}</td>
      <td>${escapeHTML(r.crm || '-')}</td>
      <td>${escapeHTML(r.telefone || '-')}</td>
      <td>${r.percentual_repasse || 0}%</td>
    </tr>`).join('');
}

function selecionarProfissional(id) {
  const r = DB.query('SELECT * FROM profissionais WHERE id=?', [id])[0];
  if (!r) return;
  document.getElementById('prof-id').value = r.id;
  document.getElementById('prof-nome').value = r.nome || '';
  document.getElementById('prof-esp').value = r.especialidade || '';
  document.getElementById('prof-crm').value = r.crm || '';
  document.getElementById('prof-tel').value = r.telefone || '';
  document.getElementById('prof-perc').value = r.percentual_repasse || 30;
}

function limparProfissional() {
  ['prof-id','prof-nome','prof-esp','prof-crm','prof-tel'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('prof-perc').value = 30;
}

function salvarProfissional() {
  const nome = document.getElementById('prof-nome').value.trim();
  if (!nome) return alert('Nome do profissional é obrigatório.');
  const id = document.getElementById('prof-id').value;
  const dados = [
    nome, document.getElementById('prof-esp').value,
    document.getElementById('prof-crm').value, document.getElementById('prof-tel').value,
    parseFloat(document.getElementById('prof-perc').value) || 30
  ];
  if (id) {
    DB.run('UPDATE profissionais SET nome=?,especialidade=?,crm=?,telefone=?,percentual_repasse=? WHERE id=?', [...dados, id]);
  } else {
    DB.run('INSERT INTO profissionais (nome,especialidade,crm,telefone,percentual_repasse) VALUES (?,?,?,?,?)', dados);
  }
  alert('Profissional salvo!');
  limparProfissional();
  carregarProfissionais();
}
