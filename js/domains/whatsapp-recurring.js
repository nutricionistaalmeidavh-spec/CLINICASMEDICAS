(function (root) {
  const whatsapp = root.PlennusWhatsAppAutomation;
  const model = root.PlennusOperationsModel;
  if (!whatsapp || !model) return;

  const originalSyncCrmPatientMessages = whatsapp.syncCrmPatientMessages?.bind(whatsapp);

  function clinicName() {
    try { return root.obterDadosClinica?.().nome || 'Plennus Clinic'; } catch (_) { return 'Plennus Clinic'; }
  }

  function syncCrmPatientMessages(patientId) {
    const row = DB.query(`SELECT p.id,p.nome,p.celular,p.telefone,c.proximo_contato_em
      FROM pacientes p JOIN crm_pacientes c ON c.paciente_id=p.id WHERE p.id=?`, [patientId])[0];
    if (!row?.proximo_contato_em) return null;

    const baseKey = model.whatsappDedupeKey('retorno', 'crm_paciente', row.id);
    const existingBase = DB.query('SELECT * FROM mensagens_whatsapp WHERE dedupe_key=?', [baseKey])[0];

    if (!existingBase || ['pendente','aberta'].includes(existingBase.status)) {
      return originalSyncCrmPatientMessages ? originalSyncCrmPatientMessages(patientId) : null;
    }

    const datedKey = model.whatsappScheduledDedupeKey('retorno', 'crm_paciente', row.id, row.proximo_contato_em);
    const message = model.buildWhatsappMessage('retorno', { paciente: row.nome, clinica: clinicName() });
    const scheduledAt = `${row.proximo_contato_em}T09:00:00`;
    const phone = row.celular || row.telefone || null;

    DB.run(`INSERT OR IGNORE INTO mensagens_whatsapp
      (paciente_id,tipo,origem_tipo,origem_id,dedupe_key,telefone,mensagem,agendada_para,status)
      VALUES (?, 'retorno', 'crm_paciente', ?, ?, ?, ?, ?, 'pendente')`, [
      row.id, row.id, datedKey, phone, message, scheduledAt
    ]);
    DB.run(`UPDATE mensagens_whatsapp SET telefone=?,mensagem=?,agendada_para=?
      WHERE dedupe_key=? AND status='pendente'`, [phone, message, scheduledAt, datedKey]);
    return DB.query('SELECT id FROM mensagens_whatsapp WHERE dedupe_key=?', [datedKey])[0]?.id || null;
  }

  function syncAllRecurring() {
    const rows = DB.query('SELECT paciente_id FROM crm_pacientes WHERE proximo_contato_em IS NOT NULL');
    rows.forEach(row => syncCrmPatientMessages(row.paciente_id));
    return rows.length;
  }

  whatsapp.syncCrmPatientMessages = syncCrmPatientMessages;
  root.PlennusWhatsappRecurring = { syncCrmPatientMessages, syncAllRecurring };
})(typeof window !== 'undefined' ? window : globalThis);
