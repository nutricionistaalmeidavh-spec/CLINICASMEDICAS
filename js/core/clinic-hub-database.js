const crypto = require('node:crypto');
const initSqlJs = require('sql.js');
const policy = require('./clinic-hub-policy');

const REMOTE_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function query(database, sql, params = []) {
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const rows = [];
  try { while (stmt.step()) rows.push(stmt.getAsObject()); return rows; }
  finally { stmt.free(); }
}

function tableExists(database, table) {
  return query(database, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]).length > 0;
}

function professionalPatientIds(database, professionalId) {
  const ids = new Set();
  const sources = ['agenda', 'prontuario_atendimentos', 'documentos_emitidos', 'planos_tratamento'];
  for (const table of sources) {
    if (!tableExists(database, table)) continue;
    try {
      query(database, `SELECT DISTINCT paciente_id AS id FROM ${table} WHERE profissional_id=? AND paciente_id IS NOT NULL`, [professionalId])
        .forEach(row => ids.add(Number(row.id)));
    } catch (_) { /* schema antigo */ }
  }
  return [...ids].filter(Number.isInteger).sort((a, b) => a - b);
}

function createClinicHubDatabaseService({ getBytes, setBytes } = {}) {
  if (typeof getBytes !== 'function' || typeof setBytes !== 'function') throw new Error('Clinic Hub database adapters are required.');
  let sqlPromise = null;
  let writeQueue = Promise.resolve();
  const SQL = () => sqlPromise || (sqlPromise = initSqlJs());

  async function operate(callback, { write = false } = {}) {
    const run = async () => {
      const module = await SQL();
      const bytes = getBytes();
      if (!Array.isArray(bytes) || !bytes.length) throw new Error('Banco da clínica indisponível.');
      const database = new module.Database(new Uint8Array(bytes));
      try {
        const result = await callback(database);
        if (write) setBytes(Array.from(database.export()));
        return result;
      } finally { database.close(); }
    };
    if (write) {
      const next = writeQueue.catch(() => {}).then(run);
      writeQueue = next.then(() => undefined, () => undefined);
      return next;
    }
    await writeQueue.catch(() => {});
    return run();
  }

  async function authenticate(username, password) {
    return operate(database => {
      const rows = query(database, `SELECT u.id,u.nome,u.usuario,u.senha,u.nivel,u.ativo,u.profissional_id,p.uid AS professional_uid
        FROM usuarios u LEFT JOIN profissionais p ON p.id=u.profissional_id
        WHERE u.usuario=? AND u.ativo=1 LIMIT 1`, [String(username || '').trim()]);
      const row = rows[0];
      if (!row) return { ok: false, error: 'Usuário ou senha inválidos.' };
      const supplied = String(password || '');
      if (String(row.senha || '') !== sha256(supplied) && String(row.senha || '') !== supplied) return { ok: false, error: 'Usuário ou senha inválidos.' };
      return {
        ok: true,
        user: {
          id: Number(row.id), nome: row.nome, usuario: row.usuario, nivel: row.nivel || 'admin', ativo: Number(row.ativo),
          profissional_id: row.profissional_id ? Number(row.profissional_id) : null,
          professional_uid: row.professional_uid || null
        }
      };
    });
  }

  async function snapshot(role, professionalId) {
    if (role !== 'medico' || !Number(professionalId)) throw new Error('Snapshot remoto permitido somente para profissional.');
    return operate(database => {
      const result = {};
      const patientIds = professionalPatientIds(database, Number(professionalId));
      for (const table of policy.allowedSnapshotTables(role)) {
        if (!tableExists(database, table)) { result[table] = []; continue; }
        if (table === 'pacientes') {
          result[table] = patientIds.length
            ? query(database, `SELECT * FROM pacientes WHERE id IN (${patientIds.map(() => '?').join(',')})`, patientIds)
            : [];
        } else if (table === 'agenda' || table === 'grade_horarios') {
          result[table] = query(database, `SELECT * FROM ${table} WHERE profissional_id=?`, [professionalId]);
        } else if (table === 'profissionais') {
          result[table] = query(database, 'SELECT * FROM profissionais WHERE id=?', [professionalId]);
        } else if (table === 'configuracoes') {
          result[table] = policy.sanitizeConfigurationRows(query(database, 'SELECT chave,valor FROM configuracoes'));
        } else {
          result[table] = query(database, `SELECT * FROM ${table}`);
        }
      }
      return { generatedAt: new Date().toISOString(), professionalId: Number(professionalId), tables: result };
    });
  }

  async function mutate(role, professionalId, action, payload = {}) {
    policy.validateCommand(role, action, payload);
    const professional = Number(professionalId);
    if (!Number.isInteger(professional) || professional <= 0) throw new Error('Profissional inválido.');
    return operate(database => {
      database.run(`CREATE TABLE IF NOT EXISTS network_mutations (
        mutation_id TEXT PRIMARY KEY, professional_id INTEGER NOT NULL, action TEXT NOT NULL,
        result_json TEXT, applied_at TEXT DEFAULT (datetime('now','localtime'))
      )`);
      const previous = query(database, 'SELECT result_json FROM network_mutations WHERE mutation_id=? LIMIT 1', [payload.mutationId])[0];
      if (previous) return { duplicate: true, result: previous.result_json ? JSON.parse(previous.result_json) : null };

      database.run('BEGIN');
      try {
        let result;
        if (action === 'agenda.updateStatus') {
          if (payload.chegadaEm != null && tableExists(database, 'agenda')) {
            const columns = query(database, 'PRAGMA table_info(agenda)').map(row => row.name);
            if (columns.includes('chegada_em')) {
              database.run('UPDATE agenda SET status=?,chegada_em=? WHERE id=? AND profissional_id=?', [payload.status, payload.chegadaEm, payload.appointmentId, professional]);
            } else {
              database.run('UPDATE agenda SET status=? WHERE id=? AND profissional_id=?', [payload.status, payload.appointmentId, professional]);
            }
          } else {
            database.run('UPDATE agenda SET status=? WHERE id=? AND profissional_id=?', [payload.status, payload.appointmentId, professional]);
          }
          if (database.getRowsModified() !== 1) throw new Error('Agendamento não encontrado para este profissional.');
          result = { appointmentId: Number(payload.appointmentId), status: payload.status, chegadaEm: payload.chegadaEm || null };
        } else if (action === 'agenda.upsert') {
          const appointment = payload.appointment || {};
          if (Number(appointment.profissional_id) !== professional) throw new Error('Agendamento pertence a outro profissional.');
          if (appointment.id) {
            database.run(`UPDATE agenda SET paciente_id=?,data=?,hora=?,status=?,observacao=? WHERE id=? AND profissional_id=?`, [
              appointment.paciente_id, appointment.data, appointment.hora, appointment.status || 'agendado', appointment.observacao || null, appointment.id, professional
            ]);
            if (database.getRowsModified() !== 1) throw new Error('Agendamento não encontrado para este profissional.');
            result = { appointmentId: Number(appointment.id) };
          } else {
            database.run('INSERT INTO agenda (paciente_id,profissional_id,data,hora,status,observacao) VALUES (?,?,?,?,?,?)', [
              appointment.paciente_id, professional, appointment.data, appointment.hora, appointment.status || 'agendado', appointment.observacao || null
            ]);
            result = { appointmentId: Number(query(database, 'SELECT last_insert_rowid() AS id')[0].id) };
          }
        } else if (action === 'patient.upsertBasic') {
          const patient = payload.patient || {};
          const allowed = new Set(professionalPatientIds(database, professional));
          if (patient.id) {
            if (!allowed.has(Number(patient.id))) throw new Error('Paciente não vinculado a este profissional.');
            database.run('UPDATE pacientes SET nome=?,telefone=?,celular=?,email=? WHERE id=?', [patient.nome, patient.telefone || null, patient.celular || null, patient.email || null, patient.id]);
            result = { patientId: Number(patient.id) };
          } else {
            database.run('INSERT INTO pacientes (nome,telefone,celular,email,ativo) VALUES (?,?,?,?,1)', [patient.nome, patient.telefone || null, patient.celular || null, patient.email || null]);
            result = { patientId: Number(query(database, 'SELECT last_insert_rowid() AS id')[0].id) };
          }
        } else {
          throw new Error('Comando remoto não permitido.');
        }
        database.run('INSERT INTO network_mutations (mutation_id,professional_id,action,result_json) VALUES (?,?,?,?)', [payload.mutationId, professional, action, JSON.stringify(result)]);
        database.run('COMMIT');
        return { duplicate: false, result };
      } catch (error) {
        try { database.run('ROLLBACK'); } catch (_) { /* no-op */ }
        throw error;
      }
    }, { write: true });
  }

  return { authenticate, snapshot, mutate };
}

function createClinicHubRpcController({ databaseService, now = Date.now, sessionTtlMs = REMOTE_SESSION_TTL_MS, onMutationApplied = () => {} } = {}) {
  if (!databaseService) throw new Error('Database service is required.');
  const sessions = new Map();

  function requireSession(deviceId, token) {
    const session = sessions.get(String(token || ''));
    if (!session || session.deviceId !== String(deviceId || '') || Number(now()) - session.lastSeenAt > sessionTtlMs) {
      if (session) sessions.delete(String(token || ''));
      throw new Error('Sessão remota inválida ou expirada.');
    }
    session.lastSeenAt = Number(now());
    return session;
  }

  async function handle({ deviceId, action, payload = {} } = {}) {
    if (action === 'session.login') {
      const auth = await databaseService.authenticate(payload.username, payload.password);
      if (!auth.ok) throw new Error(auth.error || 'Usuário ou senha inválidos.');
      if (auth.user.nivel !== 'medico' || !auth.user.profissional_id) throw new Error('Acesso remoto permitido somente para profissionais vinculados.');
      const sessionToken = crypto.randomBytes(32).toString('hex');
      sessions.set(sessionToken, {
        deviceId: String(deviceId || ''), userId: auth.user.id, role: auth.user.nivel,
        professionalId: auth.user.profissional_id, createdAt: Number(now()), lastSeenAt: Number(now())
      });
      return { sessionToken, user: auth.user };
    }
    if (action === 'session.logout') {
      const session = requireSession(deviceId, payload.sessionToken);
      sessions.delete(payload.sessionToken);
      return { ok: true, userId: session.userId };
    }
    const session = requireSession(deviceId, payload.sessionToken);
    if (action === 'shared.snapshot') return databaseService.snapshot(session.role, session.professionalId);
    if (action === 'shared.mutate') {
      const result = await databaseService.mutate(session.role, session.professionalId, payload.command, payload.data || {});
      if (!result.duplicate) await onMutationApplied({ professionalId: session.professionalId, command: payload.command, data: payload.data || {}, result: result.result });
      return result;
    }
    throw new Error('Ação RPC não permitida.');
  }

  return { handle, sessions };
}

module.exports = {
  REMOTE_SESSION_TTL_MS,
  createClinicHubDatabaseService,
  createClinicHubRpcController,
  professionalPatientIds
};
