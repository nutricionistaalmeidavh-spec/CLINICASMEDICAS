function patientInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'PA';
  return `${parts[0][0] || ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
}

function normalizePatientSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function updatePatientFilterCount() {
  const tbody = document.getElementById('tabela-pacientes');
  const count = document.getElementById('patient-count');
  if (!tbody || !count) return;
  const visible = [...tbody.querySelectorAll('tr')].filter(row => row.hidden !== true).length;
  const total = tbody.querySelectorAll('tr').length;
  count.textContent = visible === total ? String(total) : `${visible} de ${total}`;
}

function filterPatientsTable(query) {
  const tbody = document.getElementById('tabela-pacientes');
  if (!tbody) return;
  const needle = normalizePatientSearch(query);
  [...tbody.querySelectorAll('tr')].forEach(row => {
    const haystack = normalizePatientSearch(row.dataset.patientSearch || row.textContent || '');
    row.hidden = Boolean(needle) && !haystack.includes(needle);
  });
  updatePatientFilterCount();
}

function ensurePatientsUi() {
  const page = document.getElementById('page-pacientes');
  if (!page || page.dataset.premiumPatients === '1') return;
  page.dataset.premiumPatients = '1';
  page.classList.add('patients-page');

  const legacyTitle = [...page.children].find(el => el.classList?.contains('page-title'));
  const cards = [...page.children].filter(el => el.classList?.contains('card'));
  const editorCard = cards[0];
  const listCard = cards[1];
  if (!editorCard || !listCard) return;

  editorCard.classList.add('patients-editor-card');
  listCard.classList.add('patients-list-card');

  const header = document.createElement('div');
  header.className = 'patients-page-header';
  header.innerHTML = `
    <div>
      <h1 class="page-title">Pacientes</h1>
      <p class="text-muted">Cadastro, dados clínicos essenciais e acesso rápido ao prontuário.</p>
    </div>
    <button type="button" class="btn btn-primary btn-sm" onclick="limparPaciente();document.getElementById('pac-nome')?.focus()">+ Novo paciente</button>`;
  page.insertBefore(header, legacyTitle || editorCard);

  const wrapper = listCard.querySelector('.table-wrapper');
  if (wrapper) {
    const toolbar = document.createElement('div');
    toolbar.className = 'patients-list-toolbar';
    toolbar.innerHTML = `
      <div class="patients-list-meta">
        <strong>Pacientes ativos</strong>
        <span><span id="patient-count">0</span> cadastrados</span>
      </div>
      <label class="patients-search" for="patients-search-input">
        <span aria-hidden="true">⌕</span>
        <input id="patients-search-input" type="search" autocomplete="off" placeholder="Buscar nome, CPF ou telefone" aria-label="Filtrar pacientes">
      </label>`;
    listCard.insertBefore(toolbar, wrapper);
    document.getElementById('patients-search-input')?.addEventListener('input', event => filterPatientsTable(event.target.value));
  }
}

function carregarPacientes() {
  ensurePatientsUi();
  const rows = DB.query('SELECT * FROM pacientes WHERE ativo=1 ORDER BY nome');
  const tbody = document.getElementById('tabela-pacientes');
  tbody.innerHTML = rows.map(r => {
    const phone = r.celular || r.telefone || '-';
    const search = escapeHTML([r.nome, r.cpf, r.celular, r.telefone, r.email].filter(Boolean).join(' '));
    const alergiaHtml = r.alergias
      ? `<span class="patient-allergy-badge has-allergy">Alergia: ${escapeHTML(r.alergias)}</span>`
      : `<span class="patient-allergy-badge">Sem alergias registradas</span>`;
    return `
      <tr data-patient-id="${r.id}" data-patient-search="${search}" onclick="selecionarPaciente(${r.id})" style="cursor:pointer">
        <td class="patient-id-cell">#${r.id}</td>
        <td>
          <div class="patient-identity">
            <span class="patient-avatar" aria-hidden="true">${patientInitials(r.nome)}</span>
            <span class="patient-identity-copy"><strong>${escapeHTML(r.nome)}</strong><small>Paciente ativo</small></span>
          </div>
        </td>
        <td>${escapeHTML(r.cpf || '-')}</td>
        <td>${escapeHTML(phone)}</td>
        <td>${alergiaHtml}</td>
        <td>
          <button class="btn btn-secondary btn-sm patient-pep-button" onclick="event.stopPropagation();abrirProntuarioPaciente(${r.id})">PEP</button>
        </td>
      </tr>`;
  }).join('');

  const currentFilter = document.getElementById('patients-search-input')?.value || '';
  filterPatientsTable(currentFilter);
}

function selecionarPaciente(id) {
  const r = DB.query('SELECT * FROM pacientes WHERE id=?', [id])[0];
  if (!r) return;
  document.querySelectorAll('#tabela-pacientes tr.selected').forEach(row => row.classList.remove('selected'));
  document.querySelector(`#tabela-pacientes tr[data-patient-id="${Number(id)}"]`)?.classList.add('selected');
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
  document.querySelectorAll('#tabela-pacientes tr.selected').forEach(row => row.classList.remove('selected'));
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