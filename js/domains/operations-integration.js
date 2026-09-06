(function (root) {
  let installed = false;

  function ensureAppointmentFields() {
    const obs = document.getElementById('ag-obs');
    const row = obs?.closest('.form-row');
    if (!row) return;
    if (!document.getElementById('ag-procedimento')) {
      const group = document.createElement('div');
      group.className = 'form-group';
      group.innerHTML = '<label>Procedimento</label><select id="ag-procedimento"><option value="">Sem procedimento</option></select>';
      row.appendChild(group);
    }
    if (!document.getElementById('ag-convenio')) {
      const group = document.createElement('div');
      group.className = 'form-group';
      group.innerHTML = '<label>Convênio</label><select id="ag-convenio"><option value="">Particular</option></select>';
      row.appendChild(group);
    }
  }

  function populateAppointmentFields() {
    ensureAppointmentFields();
    if (!root.DB?.isReady?.()) return;
    const procedure = document.getElementById('ag-procedimento');
    if (procedure) {
      const selected = procedure.value;
      procedure.innerHTML = '<option value="">Sem procedimento</option>' + root.DB.query('SELECT id,nome,valor_particular FROM procedimentos WHERE ativo=1 ORDER BY nome')
        .map(row => `<option value="${row.id}">${root.escapeHTML(row.nome)} — ${root.formatMoney(Number(row.valor_particular || 0))}</option>`).join('');
      if (selected) procedure.value = selected;
    }
    const insurance = document.getElementById('ag-convenio');
    if (insurance) {
      const selected = insurance.value;
      insurance.innerHTML = '<option value="">Particular</option>' + root.DB.query('SELECT id,nome FROM convenios WHERE ativo=1 ORDER BY nome')
        .map(row => `<option value="${row.id}">${root.escapeHTML(row.nome)}</option>`).join('');
      if (selected) insurance.value = selected;
    }
  }

  function latestAppointmentId() {
    return Number(root.DB.query('SELECT MAX(id) id FROM agenda')[0]?.id || 0);
  }

  function installIntegration() {
    if (installed) return;
    installed = true;
    ensureAppointmentFields();

    if (typeof root.carregarSelectsAgenda === 'function') {
      const originalLoadSelects = root.carregarSelectsAgenda;
      root.carregarSelectsAgenda = function integratedLoadSelects(...args) {
        const result = originalLoadSelects.apply(this, args);
        populateAppointmentFields();
        return result;
      };
    }

    if (typeof root.agendarConsulta === 'function') {
      const originalSchedule = root.agendarConsulta;
      root.agendarConsulta = function integratedSchedule(...args) {
        const beforeId = latestAppointmentId();
        const procedureId = document.getElementById('ag-procedimento')?.value || null;
        const insuranceId = document.getElementById('ag-convenio')?.value || null;
        const result = originalSchedule.apply(this, args);
        const afterId = latestAppointmentId();
        if (afterId > beforeId) {
          root.DB.run('UPDATE agenda SET procedimento_id=?,convenio_id=? WHERE id=?', [procedureId, insuranceId, afterId]);
          const appointment = root.DB.query('SELECT status FROM agenda WHERE id=?', [afterId])[0];
          root.PlennusCRM?.onAppointmentStatusChanged(afterId, appointment?.status || 'agendado');
          root.PlennusWhatsAppAutomation?.syncAppointmentMessages(afterId);
        }
        return result;
      };
    }

    if (typeof root.mudarStatus === 'function') {
      const originalChangeStatus = root.mudarStatus;
      root.mudarStatus = function integratedChangeStatus(id, status, ...rest) {
        const result = originalChangeStatus.call(this, id, status, ...rest);
        root.PlennusCRM?.onAppointmentStatusChanged(id, status);
        root.PlennusFinanceAdvanced?.onAppointmentStatusChanged(id, status);
        if (status === 'realizado') root.PlennusInventory?.consumeForAppointment(id);
        if (status === 'cancelado' || status === 'realizado') root.PlennusWhatsAppAutomation?.cancelAppointmentMessages(id);
        return result;
      };
    }

    if (typeof root.enviarMensagemWhatsApp === 'function') {
      const originalSend = root.enviarMensagemWhatsApp;
      root.enviarMensagemWhatsApp = function integratedWhatsApp(agendaId) {
        if (root.PlennusWhatsAppAutomation?.openAppointmentMessage) return root.PlennusWhatsAppAutomation.openAppointmentMessage(agendaId, 'confirmacao');
        return originalSend.call(this, agendaId);
      };
    }
  }

  root.PlennusOperationsIntegration = { installIntegration, ensureAppointmentFields, populateAppointmentFields };
  installIntegration();
})(typeof window !== 'undefined' ? window : globalThis);
