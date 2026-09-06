(function (root) {
  const opsModel = root.PlennusOperationsModel;

  function isDentalAppointment(agendaId) {
    if (!root.DB?.isReady?.()) return false;
    return Boolean(root.DB.query('SELECT id FROM plano_tratamento_itens WHERE agenda_id=? LIMIT 1', [agendaId])[0]);
  }

  function ensureReceivableForAppointment(agendaId) {
    if (!isDentalAppointment(agendaId)) return false;
    const resolution = root.PlennusOdontology?.resolveAppointmentCharge(agendaId);
    if (!resolution?.handled) return false;
    if (!resolution.charge || Number(resolution.charge.amount || 0) <= 0) return true;

    const key = `odontologia:agenda:${agendaId}:receita`;
    const existing = root.DB.query('SELECT id FROM financeiro_lancamentos WHERE chave_origem=?', [key])[0];
    if (existing) return true;

    const appointment = root.DB.query(`SELECT a.*,p.nome paciente FROM agenda a LEFT JOIN pacientes p ON p.id=a.paciente_id WHERE a.id=?`, [agendaId])[0];
    if (!appointment) return true;
    const category = root.DB.query("SELECT id FROM financeiro_categorias WHERE nome='Procedimentos' AND tipo='receita' LIMIT 1")[0];
    const due = opsModel.brDateToIso(appointment.data) || opsModel.localIsoDate();
    root.DB.run(`INSERT INTO financeiro_lancamentos
      (tipo,descricao,categoria_id,paciente_id,profissional_id,agenda_id,procedimento_id,chave_origem,valor,vencimento_em,competencia,status)
      VALUES ('receita',?,?,?,?,?,?,?,?,?,?, 'pendente')`, [
      resolution.charge.description || `Tratamento odontológico — ${appointment.paciente || 'Paciente'}`,
      category?.id || null,
      appointment.paciente_id || null,
      appointment.profissional_id || null,
      agendaId,
      resolution.charge.procedureId || appointment.procedimento_id || null,
      key,
      Number(resolution.charge.amount || 0),
      due,
      due.slice(0, 7)
    ]);
    return true;
  }

  function cancelReceivableForAppointment(agendaId) {
    const key = `odontologia:agenda:${agendaId}:receita`;
    root.DB.run("UPDATE financeiro_lancamentos SET status='cancelado',atualizado_em=datetime('now','localtime') WHERE chave_origem=? AND status='pendente'", [key]);
  }

  function onAppointmentStatusChanged(agendaId, status) {
    if (!isDentalAppointment(agendaId)) return false;
    if (status === 'realizado') ensureReceivableForAppointment(agendaId);
    if (status === 'cancelado') cancelReceivableForAppointment(agendaId);
    return true;
  }

  root.PlennusDentalFinance = {
    isDentalAppointment,
    ensureReceivableForAppointment,
    cancelReceivableForAppointment,
    onAppointmentStatusChanged
  };
})(typeof window !== 'undefined' ? window : globalThis);
