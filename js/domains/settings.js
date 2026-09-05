function carregarConfig() {
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
  const nome = document.getElementById('usr-nome').value.trim();
  const login = document.getElementById('usr-login').value.trim();
  const senha = document.getElementById('usr-senha').value.trim();
  const nivel = document.getElementById('usr-nivel').value;

  if (!nome || !login || !senha) return alert('Preencha nome, login e senha.');
  if (senha.length < 6) return alert('A senha do usuário deve possuir no mínimo 6 caracteres.');

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

async function fazerBackup() {
  const data = DB.export();
  if (window.electronAPI) {
    const res = await window.electronAPI.salvarBackup(Array.from(data));
    if (res.ok) alert('Backup salvo com segurança em:\n' + res.path);
  } else {
    alert('Backup disponível apenas no aplicativo Electron.');
  }
}

async function restaurarBackup() {
  if (!confirm('ATENÇÃO: Restaurar um backup substituirá todos os dados atuais do sistema. Deseja continuar?')) return;
  if (window.electronAPI) {
    const res = await window.electronAPI.abrirBackup();
    if (res.ok) {
      DB.load(res.data);
      alert('Backup restaurado com sucesso! O sistema será recarregado.');
      location.reload();
    }
  } else {
    alert('Restauração disponível apenas no Electron.');
  }
}
