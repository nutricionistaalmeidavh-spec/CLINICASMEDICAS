(function (root) {
  const isolation = root.PlennusDataIsolation;
  const dbApi = root.DB;
  if (!isolation || !dbApi || dbApi.__isolationInstalled) return;

  const clinicStore = {
    init: dbApi.init.bind(dbApi),
    query: dbApi.query.bind(dbApi),
    run: dbApi.run.bind(dbApi),
    save: dbApi.save.bind(dbApi),
    getLastId: dbApi.getLastId.bind(dbApi),
    export: dbApi.export.bind(dbApi),
    restoreValidated: dbApi.restoreValidated.bind(dbApi),
    isReady: dbApi.isReady.bind(dbApi)
  };

  let sqlModule = null;
  let professionalDb = null;
  let accessSession = null;
  let bootstrapMode = true;
  let networkClientMode = false;
  let clinicSaveQueue = Promise.resolve();
  let professionalSaveQueue = Promise.resolve();

  function desktopIsolationApi() { return root.electronAPI?.dataIsolation || null; }

  function querySqlJs(database, sql, params = []) {
    const stmt = database.prepare(sql);
    stmt.bind(params);
    const rows = [];
    try { while (stmt.step()) rows.push(stmt.getAsObject()); return rows; }
    finally { stmt.free(); }
  }

  function clinicAdapter() { return { query: clinicStore.query, run: clinicStore.run }; }
  function professionalAdapter(database = professionalDb) {
    return { query: (sql, params) => querySqlJs(database, sql, params), run: (sql, params) => database.run(sql, params) };
  }

  async function getSqlModule() {
    if (sqlModule) return sqlModule;
    if (typeof root.initSqlJs !== 'function') throw new Error('sql.js indisponível para o isolamento profissional.');
    sqlModule = await root.initSqlJs({ locateFile: file => `node_modules/sql.js/dist/${file}` });
    return sqlModule;
  }

  function queueClinicSave() {
    const api = desktopIsolationApi();
    if (!api?.saveClinic || !clinicStore.isReady()) return Promise.resolve({ ok: true, skipped: true });
    const bytes = Array.from(clinicStore.export() || []);
    clinicSaveQueue = clinicSaveQueue.catch(() => {}).then(() => api.saveClinic(bytes)).then(result => {
      if (result?.ok === false) throw new Error(result.error || 'Falha ao persistir clinic.db');
      return result;
    });
    clinicSaveQueue.catch(error => console.error('Falha ao persistir clinic.db:', error));
    return clinicSaveQueue;
  }

  function queueProfessionalSave() {
    const api = desktopIsolationApi();
    if (!api?.saveProfessional || !professionalDb || !accessSession?.token) return Promise.resolve({ ok: true, skipped: true });
    const bytes = Array.from(professionalDb.export());
    const token = accessSession.token;
    professionalSaveQueue = professionalSaveQueue.catch(() => {}).then(() => api.saveProfessional(token, bytes)).then(result => {
      if (result?.ok === false) throw new Error(result.error || 'Falha ao persistir banco do profissional');
      return result;
    });
    professionalSaveQueue.catch(error => console.error('Falha ao persistir banco do profissional:', error));
    return professionalSaveQueue;
  }

  function shouldRouteClinical(sql) { return !bootstrapMode && Boolean(accessSession) && isolation.touchesClinicalTable(sql); }
  function assertProfessionalClinicalSession() {
    if (!isolation.canUseClinicalDatabase(accessSession?.role) || !professionalDb) throw new Error('A sessão atual não possui acesso a dados clínicos.');
  }

  function copySharedTableToProfessional(table) {
    if (!professionalDb || !isolation.tableExists(clinicAdapter(), table)) return;
    const target = professionalAdapter();
    if (!isolation.tableExists(target, table)) return;
    const clinicColumns = clinicStore.query(`PRAGMA table_info(${table})`).map(row => row.name).filter(Boolean);
    const professionalColumns = querySqlJs(professionalDb, `PRAGMA table_info(${table})`).map(row => row.name).filter(Boolean);
    const columns = clinicColumns.filter(column => professionalColumns.includes(column));
    if (!columns.length) return;
    const rows = clinicStore.query(`SELECT ${columns.join(',')} FROM ${table}`);
    professionalDb.run('PRAGMA foreign_keys=OFF');
    professionalDb.run(`DELETE FROM ${table}`);
    if (rows.length) {
      const stmt = professionalDb.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
      try {
        rows.forEach(row => { stmt.bind(columns.map(column => row[column])); stmt.step(); stmt.reset(); });
      } finally { stmt.free(); }
    }
    professionalDb.run('PRAGMA foreign_keys=ON');
  }

  function mirrorTouchedSharedTables(sql) {
    if (!professionalDb) return;
    const touched = isolation.extractSqlTables(sql).filter(table => isolation.SHARED_MIRROR_TABLES.includes(table));
    touched.forEach(copySharedTableToProfessional);
    if (touched.length) queueProfessionalSave();
  }

  function refreshSharedMirrors() {
    if (!professionalDb) return;
    isolation.SHARED_MIRROR_TABLES.forEach(copySharedTableToProfessional);
  }

  function buildFilteredProfessionalDatabase(professionalId) {
    if (!sqlModule) throw new Error('sql.js ainda não foi carregado para a sessão profissional.');
    const candidate = new sqlModule.Database(new Uint8Array(clinicStore.export()));
    const summary = isolation.buildProfessionalMigrationSummary(clinicAdapter(), professionalId);
    isolation.pruneProfessionalDatabase(professionalAdapter(candidate), professionalId, summary.patientIds);
    return { candidate, summary };
  }

  function replaceProfessionalFromClinic() {
    assertProfessionalClinicalSession();
    const { candidate } = buildFilteredProfessionalDatabase(accessSession.professionalId);
    professionalDb.close();
    professionalDb = candidate;
    queueProfessionalSave();
  }

  async function initializeCanonicalClinic() {
    const api = desktopIsolationApi();
    if (!api?.loadClinic || !api?.saveClinic) return;
    const loaded = await api.loadClinic();
    if (loaded?.ok === false) throw new Error(loaded.error || 'Não foi possível carregar clinic.db');
    if (Array.isArray(loaded?.data) && loaded.data.length) await clinicStore.restoreValidated(loaded.data);
    else await api.saveClinic(Array.from(clinicStore.export() || []));
  }

  async function init() {
    await clinicStore.init();
    await initializeCanonicalClinic();
    isolation.ensureIsolationSchema(clinicAdapter());
    await queueClinicSave();
    bootstrapMode = false;
    return dbApi;
  }

  function query(sql, params = []) {
    if (shouldRouteClinical(sql)) {
      assertProfessionalClinicalSession();
      return querySqlJs(professionalDb, sql, params);
    }
    return clinicStore.query(sql, params);
  }

  function run(sql, params = []) {
    if (shouldRouteClinical(sql)) {
      assertProfessionalClinicalSession();
      // O shadow local continua existindo para compatibilidade de backup da Entrega A.
      const result = clinicStore.run(sql, params);
      queueClinicSave();
      replaceProfessionalFromClinic();
      return result;
    }
    if (!bootstrapMode && accessSession && isolation.touchesClinicalTable(sql)) assertProfessionalClinicalSession();
    const result = clinicStore.run(sql, params);
    queueClinicSave();
    mirrorTouchedSharedTables(sql);
    return result;
  }

  function getLastId() { return clinicStore.getLastId(); }

  function replaceSharedTableFromSnapshot(table, rows) {
    if (!isolation.SHARED_MIRROR_TABLES.includes(table) || !isolation.tableExists(clinicAdapter(), table)) return;
    const sourceRows = Array.isArray(rows) ? rows : [];
    const localColumns = clinicStore.query(`PRAGMA table_info(${table})`).map(row => row.name).filter(Boolean);
    if (!localColumns.length) return;
    if (table === 'configuracoes') {
      sourceRows.forEach(row => {
        if (!row || !row.chave) return;
        clinicStore.run('INSERT OR REPLACE INTO configuracoes (chave,valor) VALUES (?,?)', [row.chave, row.valor ?? null]);
      });
      return;
    }
    clinicStore.run('PRAGMA foreign_keys=OFF');
    clinicStore.run(`DELETE FROM ${table}`);
    for (const row of sourceRows) {
      const columns = localColumns.filter(column => Object.prototype.hasOwnProperty.call(row || {}, column));
      if (!columns.length) continue;
      const placeholders = columns.map(() => '?').join(',');
      clinicStore.run(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`, columns.map(column => row[column]));
    }
    clinicStore.run('PRAGMA foreign_keys=ON');
  }

  async function syncSharedSnapshot(snapshot) {
    if (!snapshot?.tables || typeof snapshot.tables !== 'object') throw new Error('Snapshot compartilhado inválido.');
    const allowed = isolation.SHARED_MIRROR_TABLES.filter(table => Object.prototype.hasOwnProperty.call(snapshot.tables, table));
    clinicStore.run('BEGIN');
    try {
      allowed.forEach(table => replaceSharedTableFromSnapshot(table, snapshot.tables[table]));
      clinicStore.run('COMMIT');
    } catch (error) {
      try { clinicStore.run('ROLLBACK'); } catch (_) { /* no-op */ }
      throw error;
    }
    await queueClinicSave();
    if (professionalDb) {
      allowed.forEach(copySharedTableToProfessional);
      await queueProfessionalSave();
    }
    return { ok: true, tables: allowed };
  }

  function setNetworkClientMode(enabled) {
    networkClientMode = Boolean(enabled);
    return networkClientMode;
  }

  async function createProfessionalDatabase(session) {
    await getSqlModule();
    const { candidate, summary } = buildFilteredProfessionalDatabase(session.professionalId);
    professionalDb = candidate;
    refreshSharedMirrors();
    const result = await desktopIsolationApi().saveProfessional(session.token, Array.from(candidate.export()));
    if (result?.ok === false) {
      professionalDb.close(); professionalDb = null;
      throw new Error(result.error || 'Não foi possível criar o banco clínico do profissional.');
    }
    clinicStore.run(`INSERT OR REPLACE INTO data_isolation_migrations
      (professional_id,status,patient_count,clinical_record_count,summary,migrated_at)
      VALUES (?,?,?,?,?,datetime('now','localtime'))`, [session.professionalId, 'ready', summary.patientCount, summary.clinicalRecordCount, JSON.stringify({ source: networkClientMode ? 'network-shared-mirror' : 'clinic-shadow', patientIds: summary.patientIds })]);
    await queueClinicSave();
    return summary;
  }

  async function activateSession(session) {
    if (!session?.token || !session?.role) throw new Error('Sessão local inválida.');
    if (professionalDb) { professionalDb.close(); professionalDb = null; }
    if (!isolation.canUseClinicalDatabase(session.role)) {
      accessSession = { ...session };
      return { ok: true, role: session.role, professionalDatabase: false };
    }
    if (!Number.isInteger(Number(session.professionalId)) || Number(session.professionalId) <= 0) throw new Error('Usuário profissional sem vínculo com cadastro profissional.');
    const api = desktopIsolationApi();
    if (!api?.loadProfessional || !api?.saveProfessional) throw new Error('Persistência profissional isolada indisponível neste ambiente.');
    await getSqlModule();
    const loaded = await api.loadProfessional(session.token);
    if (loaded?.ok === false) throw new Error(loaded.error || 'Não foi possível abrir o banco do profissional.');
    accessSession = { ...session, professionalId: Number(session.professionalId) };
    if (Array.isArray(loaded?.data) && loaded.data.length) {
      professionalDb = new sqlModule.Database(new Uint8Array(loaded.data));
      refreshSharedMirrors();
      await queueProfessionalSave();
      return { ok: true, role: session.role, professionalDatabase: true, created: false };
    }
    const summary = await createProfessionalDatabase(accessSession);
    return { ok: true, role: session.role, professionalDatabase: true, created: true, summary };
  }

  async function deactivateSession() {
    try {
      await Promise.allSettled([clinicSaveQueue, professionalSaveQueue]);
      if (accessSession?.token) await desktopIsolationApi()?.endSession?.(accessSession.token);
    } finally {
      accessSession = null;
      if (professionalDb) professionalDb.close();
      professionalDb = null;
    }
  }

  async function save() {
    clinicStore.save();
    await queueClinicSave();
    if (professionalDb) await queueProfessionalSave();
  }

  async function restoreValidated(data) {
    const result = await clinicStore.restoreValidated(data);
    isolation.ensureIsolationSchema(clinicAdapter());
    await queueClinicSave();
    if (professionalDb) { professionalDb.close(); professionalDb = null; }
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
  dbApi.syncSharedSnapshot = syncSharedSnapshot;
  dbApi.setNetworkClientMode = setNetworkClientMode;
  dbApi.isNetworkClientMode = () => networkClientMode;
  dbApi.session = () => accessSession ? { ...accessSession } : null;
  dbApi.hasProfessionalDatabase = () => !!professionalDb;
  dbApi.exportProfessional = () => professionalDb ? professionalDb.export() : null;
  dbApi.__isolationInstalled = true;
})(typeof window !== 'undefined' ? window : globalThis);