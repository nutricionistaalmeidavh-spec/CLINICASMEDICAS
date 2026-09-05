(function (root) {
  async function fazerLogin() {
    if (!root.DB || !root.DB.isReady()) return alert('Banco de dados ainda não está pronto. Aguarde ou recarregue (Ctrl+R).');
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    if (!user || !pass) return alert('Preencha usuário e senha.');

    const rows = root.DB.query('SELECT * FROM usuarios WHERE usuario=? AND ativo=1', [user]);
    if (rows.length && rows[0].senha === pass) {
      root.DB.run('UPDATE usuarios SET senha=? WHERE id=?', [await root.hashPassword(pass), rows[0].id]);
      rows[0].senha = await root.hashPassword(pass);
    }
    const passwordHash = await root.hashPassword(pass);
    if (rows.length && rows[0].senha !== passwordHash) rows.length = 0;
    if (rows.length === 0) return alert('Usuário ou senha inválidos.');

    currentUser = rows[0];
    const nivel = currentUser.nivel || 'admin';
    const role = root.PlennusAccessControl.getRoleMeta(nivel);

    document.getElementById('user-display').textContent = `Olá, ${currentUser.nome}`;
    const badgeEl = document.getElementById('user-role-badge');
    if (badgeEl) {
      badgeEl.innerHTML = `<span class="badge-role ${role.className}">${role.label}</span>`;
    }

    aplicarPermissoesMenu(nivel);
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
    navegar(root.PlennusAccessControl.getLandingPage(nivel));
  }

  function aplicarPermissoesMenu(nivel) {
    document.querySelectorAll('.menu-item').forEach(item => {
      item.style.display = root.PlennusAccessControl.canViewMenuItem(nivel, item.dataset.roles) ? 'flex' : 'none';
    });

    const userManageCard = document.getElementById('card-usuarios-gestao');
    if (userManageCard) userManageCard.style.display = nivel === 'admin' ? 'block' : 'none';
  }

  function fazerLogout() {
    if (confirm('Deseja realmente sair?')) {
      currentUser = null;
      document.getElementById('app-screen').style.display = 'none';
      document.getElementById('login-screen').style.display = 'flex';
    }
  }

  root.fazerLogin = fazerLogin;
  root.aplicarPermissoesMenu = aplicarPermissoesMenu;
  root.fazerLogout = fazerLogout;
})(typeof window !== 'undefined' ? window : globalThis);
