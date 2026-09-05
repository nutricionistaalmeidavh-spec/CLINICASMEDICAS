(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlennusMigrations = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const MIGRATIONS = [
    {
      version: 1,
      name: 'baseline_clinical_platform',
      sql: [
        `CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT DEFAULT (datetime('now','localtime'))
        )`,
        `CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id INTEGER,
          usuario_nome TEXT,
          usuario_nivel TEXT,
          acao TEXT NOT NULL,
          entidade TEXT NOT NULL,
          entidade_id INTEGER,
          campos_alterados TEXT,
          contexto TEXT,
          criado_em TEXT DEFAULT (datetime('now','localtime'))
        )`,
        `CREATE TABLE IF NOT EXISTS import_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id INTEGER,
          tipo TEXT NOT NULL,
          nome_arquivo TEXT,
          total_linhas INTEGER DEFAULT 0,
          inseridos INTEGER DEFAULT 0,
          ignorados INTEGER DEFAULT 0,
          erros INTEGER DEFAULT 0,
          resumo TEXT,
          criado_em TEXT DEFAULT (datetime('now','localtime'))
        )`
      ]
    }
  ];

  const CURRENT_SCHEMA_VERSION = MIGRATIONS.at(-1).version;

  function getPendingMigrations(currentVersion) {
    const version = Number(currentVersion) || 0;
    return MIGRATIONS.filter(migration => migration.version > version);
  }

  function readUserVersion(database) {
    const result = database.exec('PRAGMA user_version');
    return result?.[0]?.values?.[0]?.[0] || 0;
  }

  function applyMigration(database, migration) {
    database.run('BEGIN TRANSACTION');
    try {
      migration.sql.forEach(statement => database.run(statement));
      database.run('INSERT OR REPLACE INTO schema_migrations (version,name) VALUES (?,?)', [migration.version, migration.name]);
      database.run(`PRAGMA user_version=${migration.version}`);
      database.run('COMMIT');
    } catch (error) {
      try { database.run('ROLLBACK'); } catch (_) { /* no-op */ }
      throw error;
    }
  }

  async function runMigrations({ database, beforeMigrate, audit } = {}) {
    if (!database) throw new Error('Database is required');
    const currentVersion = readUserVersion(database);
    const pending = getPendingMigrations(currentVersion);
    if (!pending.length) return { from: currentVersion, to: currentVersion, applied: [] };
    if (typeof beforeMigrate === 'function') {
      const backup = await beforeMigrate({ from: currentVersion, to: CURRENT_SCHEMA_VERSION });
      if (backup === false || backup?.ok === false) throw new Error('Pre-migration backup failed');
    }
    const applied = [];
    for (const migration of pending) {
      applyMigration(database, migration);
      applied.push(migration.version);
      if (typeof audit === 'function') {
        await audit({ version: migration.version, name: migration.name });
      }
    }
    return { from: currentVersion, to: readUserVersion(database), applied };
  }

  return {
    MIGRATIONS,
    CURRENT_SCHEMA_VERSION,
    getPendingMigrations,
    readUserVersion,
    applyMigration,
    runMigrations
  };
});
