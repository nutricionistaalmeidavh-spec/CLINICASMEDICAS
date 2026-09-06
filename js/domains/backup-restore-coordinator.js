(function (root) {
  function canManageBackups() {
    const role = typeof currentUser !== 'undefined' ? currentUser?.nivel || null : null;
    const access = root.PlennusAccessControl;
    return typeof access?.canManageBackups === 'function' ? access.canManageBackups(role) : role === 'admin';
  }

  function requestBackupPassword() {
    const password = prompt('Senha do backup (mínimo 10 caracteres):');
    if (password == null) return null;
    if (password.length < 10) {
      alert('A senha do backup deve ter pelo menos 10 caracteres.');
      return null;
    }
    return password;
  }

  async function cancelAttachmentSession(sessionId) {
    if (!sessionId || !root.electronAPI?.cancelarRestauracaoAnexos) return;
    try { await root.electronAPI.cancelarRestauracaoAnexos(sessionId); } catch (_) { /* no-op */ }
  }

  async function restoreBackupCoordinated() {
    if (!canManageBackups()) return alert('Apenas administradores podem restaurar backups.');
    if (!confirm('ATENÇÃO: Restaurar um backup substituirá todos os dados atuais do sistema. Um snapshot de segurança será criado antes da troca. Deseja continuar?')) return;
    if (!root.electronAPI?.abrirBackup) return alert('Restauração disponível apenas no aplicativo Electron.');

    const password = requestBackupPassword();
    if (!password) return;
    const res = await root.electronAPI.abrirBackup(password);
    if (!res?.ok) {
      if (!res?.cancelado) alert('Não foi possível abrir o backup.\n' + (res?.error || 'Arquivo inválido ou senha incorreta.'));
      return;
    }

    const attachmentSession = res.attachmentRestoreSession || null;
    let attachmentCommit = null;
    try {
      // Valida o SQLite e as tabelas obrigatórias antes de alterar anexos ativos.
      const candidate = root.DB.validateBackup(res.data);
      candidate?.close?.();

      if (attachmentSession) {
        attachmentCommit = await root.electronAPI.confirmarRestauracaoAnexos(attachmentSession);
        if (!attachmentCommit?.ok) throw new Error(attachmentCommit?.error || 'Não foi possível restaurar os anexos clínicos.');
      }

      await root.DB.restoreValidated(res.data);
      const legacy = res.legacy ? '\n\nO backup legado foi validado e convertido para o armazenamento criptografado atual.' : '';
      const attachments = res.portable ? '\nOs anexos clínicos do backup também foram restaurados.' : '';
      alert('Backup validado e restaurado com sucesso. O sistema será recarregado.' + attachments + legacy);
      location.reload();
    } catch (error) {
      if (!attachmentCommit?.ok) await cancelAttachmentSession(attachmentSession);
      if (attachmentCommit?.ok && root.electronAPI?.reverterRestauracaoAnexos) {
        const rollback = await root.electronAPI.reverterRestauracaoAnexos(
          attachmentCommit.safetyBackup || null,
          Boolean(attachmentCommit.safetyBackup)
        );
        if (!rollback?.ok) {
          alert('A restauração do banco foi cancelada, mas também houve falha ao reverter os anexos. Use o snapshot de segurança antes de continuar.\n' + (rollback?.error || error.message));
          return;
        }
      }
      alert('A restauração foi cancelada porque o backup não passou por todas as validações de integridade.\n' + error.message);
    }
  }

  root.restaurarBackup = restoreBackupCoordinated;
  root.PlennusBackupRestoreCoordinator = {
    restoreBackupCoordinated,
    requestBackupPassword,
    canManageBackups
  };
})(typeof window !== 'undefined' ? window : globalThis);
