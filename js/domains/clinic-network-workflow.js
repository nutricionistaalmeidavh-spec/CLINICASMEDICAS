(function (root) {
  const originals = {
    agendarConsulta: root.agendarConsulta,
    salvarGrade: root.salvarGrade,
    excluirGrade: root.excluirGrade,
    salvarPaciente: root.salvarPaciente,
    excluirPaciente: root.excluirPaciente,
    recarregarVisaoAgendaAtual: root.recarregarVisaoAgendaAtual
  };

  function isRemoteProfessionalMode() {
    return Boolean(root.PlennusClinicNetwork?.isRemoteProfessionalMode?.());
  }

  function bloquearOperacaoAdministrativaRemota(message = 'Esta operação administrativa deve ser feita pela recepção ou no computador Hub.') {
    if (!isRemoteProfessionalMode()) return false;
    if (typeof root.alert === 'function') root.alert(message);
    return true;
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

  // Appointment status transitions, ownership checks and remote mutation dispatch
  // are centralized in appointment-orchestrator.js.
  root.recarregarVisaoAgendaAtual = function () {
    const result = originals.recarregarVisaoAgendaAtual?.apply(this, arguments);
    applyRemoteUiGuards();
    return result;
  };

  root.PlennusClinicNetworkWorkflow = {
    isRemoteProfessionalMode,
    bloquearOperacaoAdministrativaRemota,
    applyRemoteUiGuards
  };
})(typeof window !== 'undefined' ? window : globalThis);