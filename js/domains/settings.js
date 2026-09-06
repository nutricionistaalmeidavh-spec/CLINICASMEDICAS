function settingsRole() {
  return typeof currentUser !== 'undefined' ? currentUser?.nivel || null : null;
}

function settingsCapability(name) {
  const access = window.PlennusAccessControl;
  const role = settingsRole();
  return typeof access?.[name] === 'function' ? access[name](role) : role === 'admin';
}

function requireSettingsCapability(name, message) {
  if (settingsCapability(name)) return true;
  alert(message || 'Você não possui permissão para esta ação.');
  return false;
}

function aplicarPermissoesConfiguracoes() {
  const canAdminister = settingsCapability('canManageClinicSettings');
  const clinicSave = document.querySelector('#page-configuracoes [onclick="salvarConfig()"]');
  const clinicCard = clinicSave?.closest('.card');
  if (clinicCard) clinicCard.style.display = canAdminister ? '' : 'none';

  const usersCard = document.getElementById('card-usuarios-gestao');
  if (usersCard) usersCard.style.display = settingsCapability('canManageUsers') ? '' : 'none';

  const backupButton = document.querySelector('#page-configuracoes [onclick="fazerBackup()"]');
  const backupCard = backupButton?.closest('.card');
  if (backupCard) backupCard.style.display = settingsCapability('canManageBackups') ? '' : 'none';
}

function carregarConfig() {
  aplicarPermissoesConfiguracoes();
  if (!settingsCapability('canManageClinicSettings')) return;
  const rows = DB.query('SELECT * FROM configuracoes');
  const map = {};
  rows.forEach(r => map[r.chave] = r.valor);
  document.getElementById('cfg-nome').value = map.nome_clinica || 'Plennus Clinic';
  document.getElementById('cfg-cnpj').value = map.cnpj_clinica || '';
  document.getElementById('cfg-endereco').value = map.endereco_clinica || '';
  document.getElementById('cfg-cidade').value = map.cidade_clinica || '';
  document.getElementById('cfg-telefone').value = map.telefone_clinica || '';
}

function salvarConfig() {
  if (!requireSettingsCapability('canManageClinicSettings', 'Apenas administradores podem alterar a identidade da clínica.')) return;
  const nome = document.getElementById('cfg-nome').value.trim();
  const cnpj = document.getElementById('cfg-cnpj').value.trim();
  const end = document.getElementById('cfg-endereco').value.trim();
  const cid = document.getElementById('cfg-cidade').value.trim();
  const tel = document.getElementById('cfg-telefone').value.trim();

  DB.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('nome_clinica', ?)`, [nome]);
  DB.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('cnpj_clinica', ?)`, [cnpj]);
  DB.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('endereco_clinica', ?)`, [end]);
  DB.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('cidade_clinica', ?)`, [cid]);
  DB.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('telefone_clinica', ?)`, [tel]);

  alert('Dados da clínica salvos com sucesso! Esses dados aparecerão nos cabeçalhos dos documentos PDF.');
}

function carregarUsuariosConfig() {
  aplicarPermissoesConfiguracoes();
  if (!settingsCapability('canManageUsers')) return;
  const tbody = document.getElementById('tabela-usuarios');
  if (!tbody) return;

  const users = DB.query('SELECT id, nome, usuario, nivel, ativo FROM usuarios ORDER BY id');
  const roleClass = { admin: 'badge-admin', medico: 'badge-medico', recepcao: 'badge-recepcao' };
  const roleMap = { admin: 'Administrador', medico: 'Médico', recepcao: 'Recepção' };

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.id}</td>
      <td><strong>${escapeHTML(u.nome)}</strong></td>
      <td>${escapeHTML(u.usuario)}</td>
      <td><span class="badge-role ${roleClass[u.nivel] || 'badge-admin'}">${roleMap[u.nivel] || u.nivel}</span></td>
      <td>${u.ativo ? '<span style="color:var(--success);font-weight:700;">Ativo</span>' : '<span style="color:var(--danger);">Inativo</span>'}</td>
      <td>
        ${u.id !== currentUser?.id ? `
          <button class="btn btn-sm ${u.ativo ? 'btn-danger' : 'btn-success'}" onclick="alternarStatusUsuario(${u.id}, ${u.ativo})">
            ${u.ativo ? 'Desativar' : 'Reativar'}
          </button>` : '<span class="text-muted">(Você)</span>'}
      </td>
    </tr>`).join('');
}

async function salvarNovoUsuario() {
  if (!requireSettingsCapability('canManageUsers', 'Apenas administradores podem cadastrar usuários.')) return;
  const nome = document.getElementById('usr-nome').value.trim();
  const login = document.getElementById('usr-login').value.trim();
  const senha = document.getElementById('usr-senha').value.trim();
  const nivel = document.getElementById('usr-nivel').value;

  if (!nome || !login || !senha) return alert('Preencha nome, login e senha.');
  if (senha.length < 10) return alert('A senha do usuário deve possuir no mínimo 10 caracteres.');
  if (!['admin', 'medico', 'recepcao'].includes(nivel)) return alert('Perfil de acesso inválido.');

  const existe = DB.query('SELECT id FROM usuarios WHERE usuario=?', [login]);
  if (existe.length) return alert('Este login de usuário já está em uso.');

  const passHash = await window.hashPassword(senha);
  DB.run('INSERT INTO usuarios (nome, usuario, senha, nivel, ativo) VALUES (?,?,?,?,1)', [nome, login, passHash, nivel]);

  document.getElementById('usr-nome').value = '';
  document.getElementById('usr-login').value = '';
  document.getElementById('usr-senha').value = '';

  alert(`Usuário ${login} cadastrado com sucesso no perfil ${nivel}!`);
  carregarUsuariosConfig();
}

function alternarStatusUsuario(id, statusAtual) {
  if (!requireSettingsCapability('canManageUsers', 'Apenas administradores podem alterar usuários.')) return;
  if (Number(id) === Number(currentUser?.id)) return alert('Você não pode desativar o próprio usuário durante a sessão atual.');
  const target = DB.query('SELECT id,nivel,ativo FROM usuarios WHERE id=?', [id])[0];
  if (!target) return;
  if (target.nivel === 'admin' && target.ativo && statusAtual) {
    const activeAdmins = Number(DB.query("SELECT COUNT(*) c FROM usuarios WHERE nivel='admin' AND ativo=1")[0]?.c || 0);
    if (activeAdmins <= 1) return alert('O último administrador ativo não pode ser desativado.');
  }
  const novoStatus = statusAtual ? 0 : 1;
  DB.run('UPDATE usuarios SET ativo=? WHERE id=?', [novoStatus, id]);
  carregarUsuariosConfig();
}

async function alterarSenha() {
  const atual = document.getElementById('cfg-senha-atual').value;
  const nova = document.getElementById('cfg-senha-nova').value;
  if (!currentUser) return alert('Faça login novamente.');
  if (nova.length < 10) return alert('A nova senha deve ter pelo menos 10 caracteres.');
  if (await window.hashPassword(atual) !== currentUser.senha) return alert('Senha atual incorreta.');
  const hash = await window.hashPassword(nova);
  DB.run('UPDATE usuarios SET senha=? WHERE id=?', [hash, currentUser.id]);
  currentUser.senha = hash;
  document.getElementById('cfg-senha-atual').value = '';
  document.getElementById('cfg-senha-nova').value = '';
  alert('Sua senha foi alterada com sucesso.');
}

function solicitarSenhaBackup(confirmar = false) {
  const senha = prompt('Senha do backup (mínimo 10 caracteres). Guarde esta senha: ela será necessária para restaurar o arquivo em outro computador.');
  if (senha == null) return null;
  if (senha.length < 10) {
    alert('A senha do backup deve ter pelo menos 10 caracteres.');
    return null;
  }
  if (confirmar) {
    const repeticao = prompt('Confirme a senha do backup:');
    if (repeticao !== senha) {
      alert('As senhas do backup não coincidem.');
      return null;
    }
  }
  return senha;
}

async function fazerBackup() {
  if (!requireSettingsCapability('canManageBackups', 'Apenas administradores podem exportar backups.')) return;
  if (!window.electronAPI) return alert('Backup disponível apenas no aplicativo Electron.');
  const senha = solicitarSenhaBackup(true);
  if (!senha) return;
  const data = DB.export();
  const res = await window.electronAPI.salvarBackup(Array.from(data), senha);
  if (res.ok) alert('Backup criptografado salvo com segurança em:\n' + res.path);
  else if (!res.cancelado) alert('Não foi possível criar o backup.\n' + (res.error || 'Erro desconhecido.'));
}

async function restaurarBackup() {
  if (!requireSettingsCapability('canManageBackups', 'Apenas administradores podem restaurar backups.')) return;
  if (!confirm('ATENÇÃO: Restaurar um backup substituirá todos os dados atuais do sistema. Um snapshot de segurança será criado antes da troca. Deseja continuar?')) return;
  if (!window.electronAPI) return alert('Restauração disponível apenas no Electron.');

  const senha = solicitarSenhaBackup(false);
  if (!senha) return;
  const res = await window.electronAPI.abrirBackup(senha);
  if (!res.ok) {
    if (!res.cancelado) alert('Não foi possível abrir o backup.\n' + (res.error || 'Arquivo inválido ou senha incorreta.'));
    return;
  }

  try {
    await DB.restoreValidated(res.data);
    const legado = res.legacy ? '\n\nO backup legado foi validado e convertido para o armazenamento criptografado atual.' : '';
    alert('Backup validado e restaurado com sucesso. O sistema será recarregado.' + legado);
    location.reload();
  } catch (error) {
    alert('A restauração foi cancelada porque o banco não passou na validação de integridade.\n' + error.message);
  }
}
