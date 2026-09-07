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

  async function restoreLegacyBackup(password) {
    if (!root.electronAPI?.abrirBackup) return alert('Restauração legada disponível apenas no aplicativo Electron.');
    const res = await root.electronAPI.abrirBackup(password);
    if (!res?.ok) {
      if (!res?.cancelado) alert('Não foi possível abrir o backup legado.\n' + (res?.error || 'Arquivo inválido ou senha incorreta.'));
      return;
    }

    const attachmentSession = res.attachmentRestoreSession || null;
    let attachmentCommit = null;
    try {
      const candidate = root.DB.validateBackup(res.data);
      candidate?.close?.();

      if (attachmentSession) {
        attachmentCommit = await root.electronAPI.confirmarRestauracaoAnexos(attachmentSession);
        if (!attachmentCommit?.ok) throw new Error(attachmentCommit?.error || 'Não foi possível restaurar os anexos clínicos legados.');
      }

      await root.DB.restoreValidated(res.data);
      const legacy = res.legacy ? '\n\nO backup V1 foi validado e convertido para o armazenamento criptografado atual.' : '';
      const attachments = res.portable ? '\nOs anexos clínicos do backup V2 também foram restaurados para adoção controlada.' : '';
      alert('Backup legado validado e restaurado com sucesso. O sistema será recarregado.' + attachments + legacy);
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
      alert('A restauração legada foi cancelada porque o backup não passou por todas as validações de integridade.\n' + error.message);
    }
  }

  async function restoreCompositeBackup(password) {
    const api = root.electronAPI?.compositeBackup;
    const token = root.DB?.session?.()?.token || null;
    if (!api?.open || !token) return { handled: false };

    const staged = await api.open(token, password);
    if (staged?.cancelado) return { handled: true };
    if (staged?.legacyFormat) return { handled: false, legacy: true };
    if (!staged?.ok) {
      alert('Não foi possível validar o backup completo.\n' + (staged?.error || 'Arquivo inválido ou senha incorreta.'));
      return { handled: true };
    }

    const summary = `Clínica: ${staged.clinicUid || '-'}\nProfissionais: ${Number(staged.professionals || 0)}\nArquivos clínicos: ${Number(staged.files || 0)}`;
    if (!confirm(`Backup V3 validado e preparado para restauração.\n\n${summary}\n\nAplicar este backup agora?`)) {
      await api.cancel(token, staged.sessionId);
      return { handled: true };
    }

    const committed = await api.commit(token, staged.sessionId);
    if (!committed?.ok) {
      await api.cancel(token, staged.sessionId).catch?.(() => {});
      alert('A restauração não foi aplicada. Os dados ativos foram preservados.\n' + (committed?.error || 'Falha no swap seguro.'));
      return { handled: true };
    }

    alert('Backup completo V3 restaurado com sucesso. O sistema será recarregado para abrir os novos bancos isolados.');
    location.reload();
    return { handled: true };
  }

  async function restoreBackupCoordinated() {
    if (!canManageBackups()) return alert('Apenas administradores podem restaurar backups.');
    if (!confirm('ATENÇÃO: Restaurar um backup substituirá os dados atuais. O V3 cria um snapshot de segurança antes da troca. Deseja continuar?')) return;
    if (!root.electronAPI) return alert('Restauração disponível apenas no aplicativo Electron.');

    const password = requestBackupPassword();
    if (!password) return;

    const composite = await restoreCompositeBackup(password);
    if (composite.handled) return;

    if (composite.legacy) {
      alert('Backup V1/V2 detectado. Para manter compatibilidade com versões anteriores, selecione o mesmo arquivo novamente no importador legado.');
    }
    return restoreLegacyBackup(password);
  }

  root.restaurarBackup = restoreBackupCoordinated;
  root.PlennusBackupRestoreCoordinator = {
    restoreBackupCoordinated,
    restoreCompositeBackup,
    restoreLegacyBackup,
    requestBackupPassword,
    canManageBackups
  };
})(typeof window !== 'undefined' ? window : globalThis);
