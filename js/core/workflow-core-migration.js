(function (root, factory) {
  const sqliteStore = typeof module === 'object' && module.exports
    ? require('../modules/workflow-core/adapters/sqlite-store')
    : root.WorkflowCoreSqliteStore;
  const api = factory(sqliteStore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.PlennusWorkflowCoreMigration = api;
    if (root.PlennusMigrations) api.install(root.PlennusMigrations);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (sqliteStore) {
  const VERSION = 5;
  const MIGRATION = Object.freeze({
    version: VERSION,
    name: 'workflow_core_outbox',
    sql: Object.freeze([...(sqliteStore?.SCHEMA_SQL || [])])
  });

  function install(migrations) {
    if (!migrations?.MIGRATIONS || !Array.isArray(migrations.MIGRATIONS)) {
      throw new Error('Registro de migrations indisponível.');
    }
    if (!MIGRATION.sql.length) throw new Error('Schema do Workflow Core indisponível.');
    if (!migrations.MIGRATIONS.some(item => Number(item.version) === VERSION)) {
      migrations.MIGRATIONS.push(MIGRATION);
    }
    migrations.MIGRATIONS.sort((a, b) => Number(a.version) - Number(b.version));
    migrations.CURRENT_SCHEMA_VERSION = Math.max(Number(migrations.CURRENT_SCHEMA_VERSION) || 0, VERSION);
    return migrations;
  }

  return { VERSION, MIGRATION, install };
});
