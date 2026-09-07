(function (root) {
  const legacyBackup = typeof root.fazerBackup === 'function' ? root.fazerBackup : null;

  function canManageBackups() {
    const role = typeof currentUser !== 'undefined' ? currentUser?.nivel || null : null;
    const access = root.PlennusAccessControl;
    return typeof access?.canManageBackups === 'function' ? access.canManageBackups(role) : role === 'admin';
  }

  function requestPassword() {
    if (typeof root.solicitarSenhaBackup === 'function') return root.solicitarSenhaBackup(true);
    const password = prompt('Senha do backup completo (mínimo 10 caracteres):');
    if (password == null) return null;
    if (password.length < 10) {
      alert('A senha do backup deve ter pelo menos 10 caracteres.');
      return null;
    }
    return password;
  }

  async function fazerBackupCompleto() {
    if (!canManageBackups()) return alert('Apenas administradores podem exportar backups.');
    const api = root.electronAPI?.compositeBackup;
    if (!api?.save) {
      if (legacyBackup) return legacyBackup();
      return alert('Backup completo disponível apenas no aplicativo Electron atualizado.');
    }
    const token = root.DB?.session?.()?.token || null;
    if (!token) return alert('Sua sessão administrativa expirou. Faça login novamente antes de criar o backup.');
    const password = requestPassword();
    if (!password) return;
    const result = await api.save(token, password);
    if (result?.ok) {
      alert(`Backup completo V3 salvo com segurança.\n\nProfissionais incluídos: ${Number(result.professionals || 0)}\nArquivos clínicos: ${Number(result.files || 0)}\n\n${result.path || ''}`);
      return result;
    }
    if (!result?.cancelado) alert('Não foi possível criar o backup completo.\n' + (result?.error || 'Erro desconhecido.'));
    return result;
  }

  root.fazerBackup = fazerBackupCompleto;
  root.PlennusCompositeBackupUI = { fazerBackupCompleto, canManageBackups };
})(typeof window !== 'undefined' ? window : globalThis);
