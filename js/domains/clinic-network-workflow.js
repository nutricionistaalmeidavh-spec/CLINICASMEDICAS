(function (root) {
  const originals = {
    agendarConsulta: root.agendarConsulta,
    mudarStatus: root.mudarStatus,
    marcarChegadaEspera: root.marcarChegadaEspera,
    chamarParaAtendimento: root.chamarParaAtendimento,
    salvarGrade: root.salvarGrade,
    excluirGrade: root.excluirGrade,
    salvarPaciente: root.salvarPaciente,
    excluirPaciente: root.excluirPaciente,
    recarregarVisaoAgendaAtual: root.recarregarVisaoAgendaAtual
  };

  const REMOTE_PROFESSIONAL_STATUSES = new Set(['atendimento', 'em_atendimento', 'realizado', 'finalizado']);

  function isRemoteProfessionalMode() {
    return Boolean(root.PlennusClinicNetwork?.isRemoteProfessionalMode?.());
  }

  function bloquearOperacaoAdministrativaRemota(message = 'Esta operação administrativa deve ser feita pela recepção ou no computador Hub.') {
    if (!isRemoteProfessionalMode()) return false;
    if (typeof root.alert === 'function') root.alert(message);
    return true;
  }

  function remoteSession() {
    return root.DB?.session?.() || null;
  }

  function requireOwnAppointment(appointmentId) {
    const row = root.DB?.query?.('SELECT id,profissional_id FROM agenda WHERE id=?', [appointmentId])?.[0];
    if (!row) throw new Error('Agendamento não encontrado.');
    const professionalId = Number(remoteSession()?.professionalId);
    if (!professionalId || Number(row.profissional_id) !== professionalId) {
      throw new Error('Este agendamento pertence a outro profissional.');
    }
    return row;
  }

  async function syncRemoteAppointmentStatus(appointmentId, status) {
    if (!REMOTE_PROFESSIONAL_STATUSES.has(String(status || ''))) {
      throw new Error('Esta mudança de status é responsabilidade da recepção.');
    }
    const row = requireOwnAppointment(appointmentId);
    const previous = root.DB.query('SELECT status FROM agenda WHERE id=?', [appointmentId])?.[0]?.status || null;

    root.DB.run('UPDATE agenda SET status=? WHERE id=? AND profissional_id=?', [status, Number(appointmentId), Number(row.profissional_id)]);
    originals.recarregarVisaoAgendaAtual?.();

    try {
      const result = await root.PlennusClinicNetwork.mutate('agenda.updateStatus', {
        appointmentId: Number(appointmentId),
        status: String(status)
      });
      root.PlennusClinicNetworkStatus?.refresh?.();
      return result;
    } catch (error) {
      // Erros lógicos não devem deixar o espelho local divergente. Falha de transporte é
      // convertida pelo processo principal em fila offline e retorna queued=true, sem cair aqui.
      if (previous != null) root.DB.run('UPDATE agenda SET status=? WHERE id=?', [previous, Number(appointmentId)]);
      originals.recarregarVisaoAgendaAtual?.();
      throw error;
    }
  }

  function applyRemoteUiGuards() {
    if (typeof document === 'undefined') return;
    const remote = isRemoteProfessionalMode();
    const selectors = [
      '#page-agenda [onclick*="toggleFormAgendamento"]',
      '#page-agenda .tab-btn[data-tab="grade"]',
      '#page-agenda [onclick*="salvarGrade"]',
      '#page-agenda [onclick*="excluirGrade"]',
      '#page-agenda [onclick*="marcarChegadaEspera"]',
      '#page-agenda [onclick*="mudarStatus"][onclick*="confirmado"]',
      '#page-agenda [onclick*="mudarStatus"][onclick*="cancelado"]',
      '#page-pacientes [onclick*="salvarPaciente"]',
      '#page-pacientes [onclick*="excluirPaciente"]'
    ];
    document.querySelectorAll(selectors.join(',')).forEach(element => {
      if (remote) {
        if (element.dataset.networkPreviousDisplay == null) element.dataset.networkPreviousDisplay = element.style.display || '';
        element.style.display = 'none';
      } else if (element.dataset.networkPreviousDisplay != null) {
        element.style.display = element.dataset.networkPreviousDisplay;
        delete element.dataset.networkPreviousDisplay;
      }
    });
    const form = document.getElementById('card-novo-agendamento');
    if (remote && form) form.style.display = 'none';
  }

  root.agendarConsulta = function () {
    if (bloquearOperacaoAdministrativaRemota('Novos agendamentos são gerenciados pela recepção/Hub.')) return false;
    return originals.agendarConsulta?.apply(this, arguments);
  };

  root.salvarGrade = function () {
    if (bloquearOperacaoAdministrativaRemota('A grade de horários é gerenciada pela recepção/Hub.')) return false;
    return originals.salvarGrade?.apply(this, arguments);
  };

  root.excluirGrade = function () {
    if (bloquearOperacaoAdministrativaRemota('A grade de horários é gerenciada pela recepção/Hub.')) return false;
    return originals.excluirGrade?.apply(this, arguments);
  };

  root.salvarPaciente = function () {
    if (bloquearOperacaoAdministrativaRemota('O cadastro administrativo do paciente é gerenciado pela recepção/Hub.')) return false;
    return originals.salvarPaciente?.apply(this, arguments);
  };

  root.excluirPaciente = function () {
    if (bloquearOperacaoAdministrativaRemota('O cadastro administrativo do paciente é gerenciado pela recepção/Hub.')) return false;
    return originals.excluirPaciente?.apply(this, arguments);
  };

  root.marcarChegadaEspera = function () {
    if (bloquearOperacaoAdministrativaRemota('A chegada do paciente é registrada pela recepção.')) return false;
    return originals.marcarChegadaEspera?.apply(this, arguments);
  };

  root.mudarStatus = async function (appointmentId, status) {
    if (!isRemoteProfessionalMode()) return originals.mudarStatus?.apply(this, arguments);
    try {
      return await syncRemoteAppointmentStatus(appointmentId, status);
    } catch (error) {
      if (typeof root.alert === 'function') root.alert(error.message || 'Não foi possível atualizar o atendimento.');
      return false;
    }
  };

  root.chamarParaAtendimento = async function (appointmentId, patientId, professionalId) {
    if (!isRemoteProfessionalMode()) return originals.chamarParaAtendimento?.apply(this, arguments);
    try {
      await syncRemoteAppointmentStatus(appointmentId, 'atendimento');
      root.abrirProntuarioDaAgenda?.(patientId, professionalId);
      return true;
    } catch (error) {
      if (typeof root.alert === 'function') root.alert(error.message || 'Não foi possível iniciar o atendimento.');
      return false;
    }
  };

  root.recarregarVisaoAgendaAtual = function () {
    const result = originals.recarregarVisaoAgendaAtual?.apply(this, arguments);
    applyRemoteUiGuards();
    return result;
  };

  root.PlennusClinicNetworkWorkflow = {
    isRemoteProfessionalMode,
    bloquearOperacaoAdministrativaRemota,
    syncRemoteAppointmentStatus,
    applyRemoteUiGuards
  };
})(typeof window !== 'undefined' ? window : globalThis);