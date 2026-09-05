function carregarPacientes() {
  const rows = DB.query('SELECT * FROM pacientes WHERE ativo=1 ORDER BY nome');
  const tbody = document.getElementById('tabela-pacientes');
  tbody.innerHTML = rows.map(r => {
    const alergiaHtml = r.alergias
      ? `<span style="color:#C62828;font-weight:700;">⚠️ ${escapeHTML(r.alergias)}</span>`
      : `<span class="text-muted">Nenhuma</span>`;
    return `
      <tr onclick="selecionarPaciente(${r.id})" style="cursor:pointer">
        <td>${r.id}</td>
        <td><strong>${escapeHTML(r.nome)}</strong></td>
        <td>${escapeHTML(r.cpf || '-')}</td>
        <td>${escapeHTML(r.celular || r.telefone || '-')}</td>
        <td>${alergiaHtml}</td>
        <td>
          <button class="btn btn-info btn-sm" onclick="event.stopPropagation();abrirProntuarioPaciente(${r.id})">PEP 📋</button>
        </td>
      </tr>`;
  }).join('');
}

function selecionarPaciente(id) {
  const r = DB.query('SELECT * FROM pacientes WHERE id=?', [id])[0];
  if (!r) return;
  document.getElementById('pac-id').value = r.id;
  document.getElementById('pac-nome').value = r.nome || '';
  document.getElementById('pac-cpf').value = r.cpf || '';
  document.getElementById('pac-nasc').value = r.data_nascimento || '';
  document.getElementById('pac-celular').value = r.celular || '';
  document.getElementById('pac-telefone').value = r.telefone || '';
  document.getElementById('pac-email').value = r.email || '';
  document.getElementById('pac-cep').value = r.cep || '';
  document.getElementById('pac-logradouro').value = r.logradouro || '';
  document.getElementById('pac-numero').value = r.numero || '';
  document.getElementById('pac-bairro').value = r.bairro || '';
  document.getElementById('pac-cidade').value = r.cidade || '';
  document.getElementById('pac-uf').value = r.uf || '';
  document.getElementById('pac-sexo').value = r.sexo || '';
  document.getElementById('pac-tipo-sanguineo').value = r.tipo_sanguineo || '';
  document.getElementById('pac-alergias').value = r.alergias || '';
  document.getElementById('pac-comorbidades').value = r.comorbidades || '';
  document.getElementById('pac-medicamentos').value = r.medicamentos_continuos || '';
  document.getElementById('pac-obs').value = r.observacoes || '';
}

function limparPaciente() {
  ['pac-id','pac-nome','pac-cpf','pac-nasc','pac-celular','pac-telefone','pac-email',
   'pac-cep','pac-logradouro','pac-numero','pac-bairro','pac-cidade','pac-uf',
   'pac-sexo','pac-tipo-sanguineo','pac-alergias','pac-comorbidades','pac-medicamentos','pac-obs']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
}

function salvarPaciente() {
  const nome = document.getElementById('pac-nome').value.trim();
  if (!nome) return alert('Nome do paciente é obrigatório.');
  const cpf = document.getElementById('pac-cpf').value.trim();
  if (cpf && !validarCPF(cpf)) return alert('CPF inválido.');

  const id = document.getElementById('pac-id').value;
  const dados = [
    nome, cpf, document.getElementById('pac-nasc').value,
    document.getElementById('pac-celular').value, document.getElementById('pac-telefone').value,
    document.getElementById('pac-email').value, document.getElementById('pac-cep').value,
    document.getElementById('pac-logradouro').value, document.getElementById('pac-numero').value,
    document.getElementById('pac-bairro').value, document.getElementById('pac-cidade').value,
    document.getElementById('pac-uf').value.toUpperCase(),
    document.getElementById('pac-sexo').value,
    document.getElementById('pac-tipo-sanguineo').value,
    document.getElementById('pac-alergias').value,
    document.getElementById('pac-comorbidades').value,
    document.getElementById('pac-medicamentos').value,
    document.getElementById('pac-obs').value
  ];

  if (id) {
    DB.run(`UPDATE pacientes SET nome=?,cpf=?,data_nascimento=?,celular=?,telefone=?,email=?,
      cep=?,logradouro=?,numero=?,bairro=?,cidade=?,uf=?,sexo=?,tipo_sanguineo=?,alergias=?,
      comorbidades=?,medicamentos_continuos=?,observacoes=? WHERE id=?`, [...dados, id]);
    alert('Paciente atualizado com sucesso!');
  } else {
    DB.run(`INSERT INTO pacientes (nome,cpf,data_nascimento,celular,telefone,email,cep,logradouro,numero,bairro,cidade,uf,sexo,tipo_sanguineo,alergias,comorbidades,medicamentos_continuos,observacoes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, dados);
    alert('Paciente cadastrado com sucesso!');
  }
  limparPaciente();
  carregarPacientes();
}

function excluirPaciente() {
  const id = document.getElementById('pac-id').value;
  if (!id) return alert('Selecione um paciente para excluir.');
  if (!confirm('Deseja realmente desativar este paciente?')) return;
  DB.run('UPDATE pacientes SET ativo=0 WHERE id=?', [id]);
  limparPaciente();
  carregarPacientes();
  alert('Paciente excluído do cadastro ativo.');
}
