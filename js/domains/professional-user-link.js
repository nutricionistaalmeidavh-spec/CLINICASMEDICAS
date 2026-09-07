(function (root) {
  function ensureProfessionalField() {
    const level = document.getElementById('usr-nivel');
    if (!level || document.getElementById('usr-profissional')) return;
    const levelGroup = level.closest('.form-group');
    if (!levelGroup) return;

    const group = document.createElement('div');
    group.className = 'form-group';
    group.id = 'usr-profissional-group';
    group.style.maxWidth = '240px';
    const label = document.createElement('label');
    label.textContent = 'Cadastro profissional';
    const select = document.createElement('select');
    select.id = 'usr-profissional';
    group.append(label, select);
    levelGroup.insertAdjacentElement('afterend', group);

    level.addEventListener('change', updateVisibility);
    updateVisibility();
    populateProfessionals();
  }

  function updateVisibility() {
    const role = document.getElementById('usr-nivel')?.value;
    const group = document.getElementById('usr-profissional-group');
    if (group) group.style.display = role === 'medico' ? '' : 'none';
  }

  function populateProfessionals() {
    const select = document.getElementById('usr-profissional');
    if (!select || !root.DB?.isReady?.()) return;
    const current = select.value;
    const professionals = root.DB.query('SELECT id,nome,especialidade FROM profissionais WHERE ativo=1 ORDER BY nome');
    select.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = professionals.length ? 'Selecione o profissional' : 'Cadastre um profissional primeiro';
    select.appendChild(empty);
    professionals.forEach(professional => {
      const option = document.createElement('option');
      option.value = String(professional.id);
      option.textContent = professional.especialidade
        ? `${professional.nome} — ${professional.especialidade}`
        : professional.nome;
      select.appendChild(option);
    });
    if ([...select.options].some(option => option.value === current)) select.value = current;
  }

  async function saveUserWithProfessionalLink() {
    const access = root.PlennusAccessControl;
    const role = typeof currentUser !== 'undefined' ? currentUser?.nivel : null;
    if (!access?.canManageUsers?.(role)) return alert('Apenas administradores podem cadastrar usuários.');

    const nome = document.getElementById('usr-nome').value.trim();
    const login = document.getElementById('usr-login').value.trim();
    const senha = document.getElementById('usr-senha').value.trim();
    const nivel = document.getElementById('usr-nivel').value;
    const profissionalId = nivel === 'medico' ? Number(document.getElementById('usr-profissional')?.value) : null;

    if (!nome || !login || !senha) return alert('Preencha nome, login e senha.');
    if (senha.length < 10) return alert('A senha do usuário deve possuir no mínimo 10 caracteres.');
    if (!['admin', 'medico', 'recepcao'].includes(nivel)) return alert('Perfil de acesso inválido.');
    if (nivel === 'medico' && (!Number.isInteger(profissionalId) || profissionalId <= 0)) {
      return alert('Selecione o cadastro profissional que será vinculado a este usuário.');
    }

    if (root.DB.query('SELECT id FROM usuarios WHERE usuario=?', [login]).length) {
      return alert('Este login de usuário já está em uso.');
    }
    if (profissionalId) {
      const professional = root.DB.query('SELECT id FROM profissionais WHERE id=? AND ativo=1', [profissionalId])[0];
      if (!professional) return alert('Cadastro profissional inválido ou inativo.');
      const linked = root.DB.query("SELECT id FROM usuarios WHERE profissional_id=? AND nivel='medico' AND ativo=1", [profissionalId]);
      if (linked.length) return alert('Este profissional já possui um usuário ativo vinculado.');
    }

    const passHash = await root.hashPassword(senha);
    root.DB.run('INSERT INTO usuarios (nome, usuario, senha, nivel, profissional_id, ativo) VALUES (?,?,?,?,?,1)', [
      nome,
      login,
      passHash,
      nivel,
      profissionalId || null
    ]);

    document.getElementById('usr-nome').value = '';
    document.getElementById('usr-login').value = '';
    document.getElementById('usr-senha').value = '';
    const professionalSelect = document.getElementById('usr-profissional');
    if (professionalSelect) professionalSelect.value = '';
    alert(`Usuário ${login} cadastrado com sucesso no perfil ${nivel}!`);
    root.carregarUsuariosConfig?.();
  }

  const originalLoadConfig = root.carregarConfig;
  if (typeof originalLoadConfig === 'function') {
    root.carregarConfig = function (...args) {
      const result = originalLoadConfig.apply(this, args);
      ensureProfessionalField();
      populateProfessionals();
      updateVisibility();
      return result;
    };
  }

  const originalLoadUsers = root.carregarUsuariosConfig;
  if (typeof originalLoadUsers === 'function') {
    root.carregarUsuariosConfig = function (...args) {
      const result = originalLoadUsers.apply(this, args);
      ensureProfessionalField();
      populateProfessionals();
      updateVisibility();
      return result;
    };
  }

  root.salvarNovoUsuario = saveUserWithProfessionalLink;
  root.PlennusProfessionalUserLink = { ensureProfessionalField, populateProfessionals, updateVisibility };
})(typeof window !== 'undefined' ? window : globalThis);