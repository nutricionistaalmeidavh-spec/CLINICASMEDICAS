(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlennusAppointmentOrchestratorModule = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const STATUS_TO_ACTION = Object.freeze({
    confirmado: 'confirm',
    espera: 'arrive',
    atendimento: 'start',
    em_atendimento: 'start',
    realizado: 'complete',
    finalizado: 'complete',
    cancelado: 'cancel'
  });

  const ACTION_TO_STATUS = Object.freeze({
    confirm: 'confirmado',
    arrive: 'espera',
    start: 'atendimento',
    complete: 'realizado',
    cancel: 'cancelado'
  });

  function createAppointmentOrchestrator({
    core,
    db,
    transact,
    getActor,
    isRemoteProfessionalMode = () => false,
    networkMutate = async () => ({ ok: false, error: 'Clinic Network unavailable.' }),
    refresh = () => {},
    openPep = () => {},
    nowTime = () => '',
    onEventPersisted = () => {}
  } = {}) {
    if (!core || typeof core.execute !== 'function' || typeof core.appendEvent !== 'function') throw new Error('Appointment Workflow Core is required.');
    if (!db || typeof db.query !== 'function' || typeof db.run !== 'function') throw new Error('Appointment database adapter is required.');
    if (typeof transact !== 'function') throw new Error('Appointment transaction adapter is required.');
    if (typeof getActor !== 'function') throw new Error('Appointment actor provider is required.');

    function loadAppointment(appointmentId) {
      const id = Number(appointmentId);
      if (!Number.isInteger(id) || id <= 0) throw new Error('Agendamento inválido.');
      const row = db.query('SELECT * FROM agenda WHERE id=? LIMIT 1', [id])?.[0];
      if (!row) throw new Error('Agendamento não encontrado.');
      return row;
    }

    function buildPayload(row, extra = {}) {
      return {
        professionalId: Number(row.profissional_id) || null,
        patientId: Number(row.paciente_id) || null,
        procedureId: row.procedimento_id == null ? null : Number(row.procedimento_id),
        insuranceId: row.convenio_id == null ? null : Number(row.convenio_id),
        ...extra
      };
    }

    function executeTransition(row, action, extraPayload = {}) {
      const actor = getActor() || {};
      const remote = Boolean(isRemoteProfessionalMode());
      return core.execute({
        workflow: 'appointment',
        action,
        aggregateId: Number(row.id),
        currentState: String(row.status || ''),
        actor: {
          userId: actor.userId ?? actor.id ?? null,
          role: actor.role ?? actor.nivel ?? null,
          professionalId: actor.professionalId ?? actor.profissional_id ?? null
        },
        source: remote ? 'remote-professional' : 'hub',
        payload: buildPayload(row, extraPayload)
      });
    }

    function applyLocalStatus(row, nextStatus, arrivedAt = null) {
      if (nextStatus === 'espera') {
        db.run('UPDATE agenda SET status=?, chegada_em=? WHERE id=?', [nextStatus, arrivedAt || nowTime(), Number(row.id)]);
      } else {
        db.run('UPDATE agenda SET status=? WHERE id=?', [nextStatus, Number(row.id)]);
      }
    }

    async function applyRemote(row, execution, arrivedAt = null) {
      const previousStatus = row.status;
      const previousArrival = row.chegada_em ?? null;
      const nextStatus = execution.transition.to;
      const chegadaEm = nextStatus === 'espera' ? (arrivedAt || nowTime()) : null;
      applyLocalStatus(row, nextStatus, chegadaEm);
      refresh();
      try {
        const network = await networkMutate('agenda.updateStatus', {
          appointmentId: Number(row.id),
          status: nextStatus,
          ...(chegadaEm ? { chegadaEm } : {})
        });
        return { ...execution, network, queued: Boolean(network?.queued) };
      } catch (error) {
        if (previousStatus === 'espera') {
          db.run('UPDATE agenda SET status=?, chegada_em=? WHERE id=?', [previousStatus, previousArrival, Number(row.id)]);
        } else {
          db.run('UPDATE agenda SET status=? WHERE id=?', [previousStatus, Number(row.id)]);
        }
        refresh();
        throw error;
      }
    }

    async function transition(appointmentId, action, { arrivedAt = null, openAfterStart = false } = {}) {
      const row = loadAppointment(appointmentId);
      const extraPayload = action === 'arrive' ? { arrivedAt: arrivedAt || nowTime() } : {};
      const execution = executeTransition(row, action, extraPayload);
      if (isRemoteProfessionalMode()) {
        const result = await applyRemote(row, execution, arrivedAt);
        if (action === 'start' && openAfterStart) openPep(row.paciente_id, row.profissional_id, row.id);
        return result;
      }

      transact(() => {
        applyLocalStatus(row, execution.transition.to, arrivedAt);
        core.appendEvent(execution.event);
      });
      onEventPersisted(execution.event);
      refresh();
      if (action === 'start' && openAfterStart) openPep(row.paciente_id, row.profissional_id, row.id);
      return execution;
    }

    return {
      confirm: id => transition(id, 'confirm'),
      arrive: (id, arrivedAt = null) => transition(id, 'arrive', { arrivedAt }),
      start: (id, options = {}) => transition(id, 'start', options),
      complete: id => transition(id, 'complete'),
      cancel: id => transition(id, 'cancel'),
      transition,
      loadAppointment
    };
  }

  function installBrowserOrchestrator(root) {
    if (!root || !root.DB || !root.WorkflowCore || !root.WorkflowCoreSqliteStore || !root.PlennusAppointmentWorkflowDefinition) return null;
    if (root.PlennusAppointmentOrchestrator) return root.PlennusAppointmentOrchestrator;

    const store = root.WorkflowCoreSqliteStore.createSqliteWorkflowStore({
      query: (sql, params = []) => root.DB.query(sql, params),
      run: (sql, params = []) => root.DB.run(sql, params)
    });
    const core = root.WorkflowCore.createWorkflowCore({ store, logger: root.console || null });
    core.registerWorkflow('appointment', root.PlennusAppointmentWorkflowDefinition.createAppointmentWorkflowDefinition());

    const transact = work => {
      root.DB.run('BEGIN IMMEDIATE');
      try {
        const result = work();
        root.DB.run('COMMIT');
        return result;
      } catch (error) {
        try { root.DB.run('ROLLBACK'); } catch (_) { /* no-op */ }
        throw error;
      }
    };

    const currentActor = () => {
      const session = root.DB?.session?.() || {};
      const user = root.currentUser || (typeof currentUser !== 'undefined' ? currentUser : {}) || {};
      return {
        userId: session.userId ?? user.id ?? null,
        role: session.role ?? user.nivel ?? null,
        professionalId: session.professionalId ?? user.profissional_id ?? null
      };
    };

    const orchestrator = createAppointmentOrchestrator({
      core,
      db: root.DB,
      transact,
      getActor: currentActor,
      isRemoteProfessionalMode: () => Boolean(root.PlennusClinicNetwork?.isRemoteProfessionalMode?.()),
      networkMutate: (command, data) => root.PlennusClinicNetwork.mutate(command, data),
      refresh: () => {
        root.recarregarVisaoAgendaAtual?.();
        root.PlennusClinicNetworkStatus?.refresh?.();
      },
      openPep: (patientId, professionalId, appointmentId) => root.abrirProntuarioDaAgenda?.(patientId, professionalId, appointmentId),
      nowTime: () => root.agoraHora?.() || '',
      onEventPersisted: event => root.PlennusAppointmentReconciliation?.onEventPersisted?.(event)
    });

    root.PlennusAppointmentWorkflowRuntime = { core, store };
    root.PlennusAppointmentOrchestrator = orchestrator;

    root.mudarStatus = async function mudarStatusPorWorkflow(id, status) {
      const action = STATUS_TO_ACTION[String(status || '')];
      if (!action) throw new Error(`Status de agendamento não suportado: ${status}`);
      try { return await orchestrator.transition(id, action); }
      catch (error) {
        root.alert?.(error.message || 'Não foi possível atualizar o agendamento.');
        return false;
      }
    };

    root.marcarChegadaEspera = async function marcarChegadaPorWorkflow(id) {
      try { return await orchestrator.arrive(id, root.agoraHora?.() || ''); }
      catch (error) {
        root.alert?.(error.message || 'Não foi possível registrar a chegada.');
        return false;
      }
    };

    root.chamarParaAtendimento = async function chamarPorWorkflow(id) {
      try { return await orchestrator.start(id, { openAfterStart: true }); }
      catch (error) {
        root.alert?.(error.message || 'Não foi possível iniciar o atendimento.');
        return false;
      }
    };

    return orchestrator;
  }

  const api = {
    STATUS_TO_ACTION,
    ACTION_TO_STATUS,
    createAppointmentOrchestrator,
    installBrowserOrchestrator
  };

  if (typeof window !== 'undefined') installBrowserOrchestrator(window);
  return api;
});
