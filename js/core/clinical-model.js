(function (root) {
  function consentStatus(row) {
    if (!row) return 'nao_autorizado';
    if (row.revogado_em) return 'revogado';
    return Number(row.autorizado) === 1 ? 'autorizado' : 'nao_autorizado';
  }

  function toFiniteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function labResultStatus(result) {
    if (!result) return 'sem_classificacao';
    const value = toFiniteNumber(result.valor);
    const min = toFiniteNumber(result.referencia_min);
    const max = toFiniteNumber(result.referencia_max);
    if (value === null || min === null || max === null) return 'sem_classificacao';
    if (value < min) return 'baixo';
    if (value > max) return 'alto';
    return 'normal';
  }

  function buildVitalSeries(encounters) {
    const ordered = [...(encounters || [])].sort((a, b) => String(a.data_hora || '').localeCompare(String(b.data_hora || '')));
    const mapping = {
      peso: 'peso',
      imc: 'imc',
      pressao_arterial: 'pressao_arterial',
      frequencia_cardiaca: 'frequencia_cardiaca',
      temperatura: 'temperatura'
    };
    const series = Object.fromEntries(Object.keys(mapping).map(key => [key, []]));

    ordered.forEach(encounter => {
      Object.entries(mapping).forEach(([seriesKey, field]) => {
        const value = encounter[field];
        if (value === null || value === undefined || value === '') return;
        series[seriesKey].push({
          date: encounter.data_hora || '',
          value,
          encounterId: encounter.id ?? null
        });
      });
    });

    return series;
  }

  function validateClinicalFileMetadata(input) {
    const row = input || {};
    const errors = [];
    if (!row.paciente_id) errors.push('paciente_id');
    if (!String(row.categoria || '').trim()) errors.push('categoria');
    if (!String(row.nome_arquivo || '').trim()) errors.push('nome_arquivo');
    return errors;
  }

  function hasFutureAppointmentForEncounter(encounter, futureAppointments) {
    const encounterPatient = encounter && encounter.paciente_id;
    if (!futureAppointments || !futureAppointments.length) return false;
    if (encounterPatient === null || encounterPatient === undefined) return futureAppointments.length > 0;
    return futureAppointments.some(appointment => Number(appointment.paciente_id) === Number(encounterPatient));
  }

  function derivePendingItems(input) {
    const source = input || {};
    const result = new Map();

    (source.labs || []).forEach(lab => {
      if (lab && lab.id !== undefined && lab.status_revisao === 'pendente') {
        const key = `lab:${lab.id}`;
        result.set(key, {
          key,
          kind: 'derived',
          type: 'lab_review',
          title: 'Revisar exame laboratorial',
          description: lab.laboratorio ? `Exame de ${lab.laboratorio}` : 'Exame aguardando revisão',
          date: lab.data_coleta || null,
          sourceId: lab.id,
          status: 'aberta'
        });
      }
    });

    (source.encounters || []).forEach(encounter => {
      if (!encounter || encounter.id === undefined || Number(encounter.finalizado) !== 1) return;
      if (hasFutureAppointmentForEncounter(encounter, source.futureAppointments || [])) return;
      const key = `followup:${encounter.id}`;
      result.set(key, {
        key,
        kind: 'derived',
        type: 'followup',
        title: 'Retorno não agendado',
        description: 'Atendimento finalizado sem agendamento futuro identificado.',
        date: encounter.data_hora || null,
        sourceId: encounter.id,
        status: 'aberta'
      });
    });

    (source.manualItems || []).forEach(item => {
      if (!item || item.id === undefined) return;
      const key = `manual:${item.id}`;
      result.set(key, {
        key,
        kind: 'manual',
        type: item.tipo || 'manual',
        title: item.titulo || 'Pendência clínica',
        description: item.descricao || '',
        date: item.vencimento_em || item.criado_em || null,
        sourceId: item.id,
        status: item.status || 'aberta',
        raw: item
      });
    });

    return Array.from(result.values());
  }

  const api = {
    consentStatus,
    labResultStatus,
    buildVitalSeries,
    validateClinicalFileMetadata,
    derivePendingItems
  };

  root.PlennusClinicalModel = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
