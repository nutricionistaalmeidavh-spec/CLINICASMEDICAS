(function (root) {
  const isolation = root.PlennusDataIsolation;
  const dbApi = root.DB;
  if (!isolation || !dbApi || dbApi.__isolationInstalled) return;

  const legacy = {
    init: dbApi.init.bind(dbApi),
    query: dbApi.query.bind(dbApi),
    run: dbApi.run.bind(dbApi),
    save: dbApi.save.bind(dbApi),
    getLastId: dbApi.getLastId.bind(dbApi),
    export: dbApi.export.bind(dbApi),
    validateBackup: dbApi.validateBackup.bind(dbApi),
    restoreValidated: dbApi.restoreValidated.bind(dbApi),
    load: dbApi.load.bind(dbApi),
    isReady: dbApi.isReady.bind(dbApi)
  };

  let sqlModule = null;
  let clinicalDb = null;
  let accessSession = null;
  let bootstrapMode = true;
  let lastWriteStore = 'clinic';
  let clinicSaveQueue = Promise.resolve();
  let clinicalSaveQueue = Promise.resolve();

  function desktopIsolationApi() {
    return root.electronAPI?.dataIsolation || null;
  }

  function querySqlJs(database, sql, params = []) {
    const stmt = database.prepare(sql);
    stmt.bind(params);
    const rows = [];
    try {
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  function getLastSqlJsId(database) {
    const result = database.exec('SELECT last_insert_rowid() AS id');
    return result?.[0]?.values?.[0]?.[0] || 0;
  }

  function clinicAdapter() {
    return { query: legacy.query, run: legacy.run };
  }

  async function getSqlModule() {
    if (sqlModule) return sqlModule;
    if (typeof root.initSqlJs !== 'function') throw new Error('sql.js indisponível para o isolamento profissional.');
    sqlModule = await root.initSqlJs({ locateFile: file => `node_modules/sql.js/dist/${file}` });
    return sqlModule;
  }

  function queueClinicSave() {
    const api = desktopIsolationApi();
    if (!api?.saveClinic || !legacy.isReady()) return Promise.resolve({ ok: true, skipped: true });
    const bytes = Array.from(legacy.export() || []);
    clinicSaveQueue = clinicSaveQueue
      .catch(() => {})
      .then(() => api.saveClinic(bytes))
      .then(result => {
        if (result?.ok === false) throw new Error(result.error || 'Falha ao persistir clinic.db');
        return result;
      });
    clinicSaveQueue.catch(error => console.error('Falha ao persistir clinic.db:', error));
    return clinicSaveQueue;
  }

  function queueClinicalSave() {
    const api = desktopIsolationApi();
    if (!api?.saveProfessional || !clinicalDb || !accessSession?.token) return Promise.resolve({ ok: true, skipped: true });
    const bytes = Array.from(clinicalDb.export());
    const token = accessSession.token;
    clinicalSaveQueue = clinicalSaveQueue
      .catch(() => {})
      .then(() => api.saveProfessional(token, bytes))
      .then(result => {
        if (result?.ok === false) throw new Error(result.error || 'Falha ao persistir banco do profissional');
        return result;
      });
    clinicalSaveQueue.catch(error => console.error('Falha ao persistir banco do profissional:', error));
    return clinicalSaveQueue;
  }

  function shouldRouteClinical(sql) {
    if (bootstrapMode || !accessSession) return false;
    return isolation.touchesClinicalTable(sql);
  }

  function assertClinicalSession() {
    if (!isolation.canUseClinicalDatabase(accessSession?.role) || !clinicalDb) {
      throw new Error('A sessão atual não possui acesso a dados clínicos.');
    }
  }

  function copySharedTableToProfessional(table) {
    if (!clinicalDb || !isolation.tableExists(clinicAdapter(), table)) return;
    const clinicalAdapter = {
      query: (sql, params) => querySqlJs(clinicalDb, sql, params),
      run: (sql, params) => clinicalDb.run(sql, params)
    };
    if (!isolation.tableExists(clinicalAdapter, table)) return;

    const clinicColumns = legacy.query(`PRAGMA table_info(${table})`).map(row => row.name).filter(Boolean);
    const clinicalColumns = querySqlJs(clinicalDb, `PRAGMA table_info(${table})`).map(row => row.name).filter(Boolean);
    const columns = clinicColumns.filter(column => clinicalColumns.includes(column));
    if (!columns.length) return;

    const rows = legacy.query(`SELECT ${columns.join(',')} FROM ${table}`);
    clinicalDb.run('PRAGMA foreign_keys=OFF');
    clinicalDb.run(`DELETE FROM ${table}`);
    if (rows.length) {
      const placeholders = columns.map(() => '?').join(',');
      const stmt = clinicalDb.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`);
      try {
        rows.forEach(row => {
          stmt.bind(columns.map(column => row[column]));
          stmt.step();
          stmt.reset();
        });
      } finally {
        stmt.free();
      }
    }
    clinicalDb.run('PRAGMA foreign_keys=ON');
  }

  function mirrorTouchedSharedTables(sql) {
    if (!clinicalDb) return;
    const touched = isolation.extractSqlTables(sql)
      .filter(table => isolation.SHARED_MIRROR_TABLES.includes(table));
    touched.forEach(copySharedTableToProfessional);
    if (touched.length) queueClinicalSave();
  }

  function refreshSharedMirrors() {
    if (!clinicalDb) return;
    isolation.SHARED_MIRROR_TABLES.forEach(copySharedTableToProfessional);
  }

  async function initializeCanonicalClinic() {
    const api = desktopIsolationApi();
    if (!api?.loadClinic || !api?.saveClinic) return;
    const loaded = await api.loadClinic();
    if (loaded?.ok === false) throw new Error(loaded.error || 'Não foi possível carregar clinic.db');
    if (Array.isArray(loaded?.data) && loaded.data.length) {
      await legacy.restoreValidated(loaded.data);
    } else {
      await api.saveClinic(Array.from(legacy.export() || []));
    }
  }

  async function init() {
    await legacy.init();
    await initializeCanonicalClinic();
    isolation.ensureIsolationSchema(clinicAdapter());
    await queueClinicSave();
    bootstrapMode = false;
    return dbApi;
  }

  function query(sql, params = []) {
    if (shouldRouteClinical(sql)) {
      assertClinicalSession();
      return querySqlJs(clinicalDb, sql, params);
    }
    return legacy.query(sql, params);
  }

  function run(sql, params = []) {
    if (shouldRouteClinical(sql)) {
      assertClinicalSession();
      clinicalDb.run(sql, params);
      lastWriteStore = 'professional';
      queueClinicalSave();
      return clinicalDb.getRowsModified();
    }

    if (!bootstrapMode && accessSession && isolation.touchesClinicalTable(sql)) {
      assertClinicalSession();
    }

    const result = legacy.run(sql, params);
    lastWriteStore = 'clinic';
    queueClinicSave();
    mirrorTouchedSharedTables(sql);
    return result;
  }

  function getLastId() {
    return lastWriteStore === 'professional' && clinicalDb ? getLastSqlJsId(clinicalDb) : legacy.getLastId();
  }

  async function createProfessionalDatabase(session) {
    const SQL = await getSqlModule();
    const candidate = new SQL.Database(new Uint8Array(legacy.export()));
    const summary = isolation.buildProfessionalMigrationSummary(clinicAdapter(), session.professionalId);
    isolation.pruneProfessionalDatabase(
      { query: (sql, params) => querySqlJs(candidate, sql, params), run: (sql, params) => candidate.run(sql, params) },
      session.professionalId,
      summary.patientIds
    );
    clinicalDb = candidate;
    refreshSharedMirrors();
    const result = await desktopIsolationApi().saveProfessional(session.token, Array.from(candidate.export()));
    if (result?.ok === false) {
      clinicalDb.close();
      clinicalDb = null;
      throw new Error(result.error || 'Não foi possível criar o banco clínico do profissional.');
    }
    legacy.run(`INSERT OR REPLACE INTO data_isolation_migrations
      (professional_id,status,patient_count,clinical_record_count,summary,migrated_at)
      VALUES (?,?,?,?,?,datetime('now','localtime'))`, [
      session.professionalId,
      'ready',
      summary.patientCount,
      summary.clinicalRecordCount,
      JSON.stringify({ source: 'legacy-clinic-snapshot', patientIds: summary.patientIds })
    ]);
    await queueClinicSave();
    return summary;
  }

  async function activateSession(session) {
    if (!session?.token || !session?.role) throw new Error('Sessão local inválida.');
    if (clinicalDb) {
      clinicalDb.close();
      clinicalDb = null;
    }

    if (!isolation.canUseClinicalDatabase(session.role)) {
      accessSession = { ...session };
      return { ok: true, role: session.role, professionalDatabase: false };
    }
    if (!Number.isInteger(Number(session.professionalId)) || Number(session.professionalId) <= 0) {
      throw new Error('Usuário profissional sem vínculo com cadastro profissional.');
    }

    const api = desktopIsolationApi();
    if (!api?.loadProfessional || !api?.saveProfessional) {
      throw new Error('Persistência profissional isolada indisponível neste ambiente.');
    }

    const loaded = await api.loadProfessional(session.token);
    if (loaded?.ok === false) throw new Error(loaded.error || 'Não foi possível abrir o banco do profissional.');

    accessSession = { ...session, professionalId: Number(session.professionalId) };
    if (Array.isArray(loaded?.data) && loaded.data.length) {
      const SQL = await getSqlModule();
      clinicalDb = new SQL.Database(new Uint8Array(loaded.data));
      refreshSharedMirrors();
      await queueClinicalSave();
      return { ok: true, role: session.role, professionalDatabase: true, created: false };
    }

    const summary = await createProfessionalDatabase(accessSession);
    return { ok: true, role: session.role, professionalDatabase: true, created: true, summary };
  }

  async function deactivateSession() {
    try {
      await Promise.allSettled([clinicSaveQueue, clinicalSaveQueue]);
      if (accessSession?.token) await desktopIsolationApi()?.endSession?.(accessSession.token);
    } finally {
      accessSession = null;
      if (clinicalDb) clinicalDb.close();
      clinicalDb = null;
      lastWriteStore = 'clinic';
    }
  }

  async function save() {
    legacy.save();
    await queueClinicSave();
    if (clinicalDb) await queueClinicalSave();
  }

  async function restoreValidated(data) {
    const result = await legacy.restoreValidated(data);
    isolation.ensureIsolationSchema(clinicAdapter());
    await queueClinicSave();
    if (clinicalDb) {
      clinicalDb.close();
      clinicalDb = null;
    }
    return result;
  }

  dbApi.init = init;
  dbApi.query = query;
  dbApi.run = run;
  dbApi.getLastId = getLastId;
  dbApi.save = save;
  dbApi.restoreValidated = restoreValidated;
  dbApi.load = restoreValidated;
  dbApi.activateSession = activateSession;
  dbApi.deactivateSession = deactivateSession;
  dbApi.session = () => accessSession ? { ...accessSession } : null;
  dbApi.hasProfessionalDatabase = () => !!clinicalDb;
  dbApi.exportProfessional = () => clinicalDb ? clinicalDb.export() : null;
  dbApi.__isolationInstalled = true;
})(typeof window !== 'undefined' ? window : globalThis);