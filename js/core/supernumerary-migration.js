(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.PlennusSupernumeraryMigration = api;
    if (root.PlennusMigrations) api.install(root.PlennusMigrations);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const VERSION = 4;
  const MIGRATION = Object.freeze({
    version: VERSION,
    name: 'dental_supernumerary_elements',
    sql: [
      `CREATE TABLE IF NOT EXISTS odontograma_elementos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT NOT NULL UNIQUE,
        odontograma_id INTEGER NOT NULL,
        profissional_id INTEGER NOT NULL,
        elemento_tipo TEXT NOT NULL DEFAULT 'supranumerario' CHECK (elemento_tipo IN ('supranumerario')),
        dente_referencia_fdi INTEGER NOT NULL,
        indice INTEGER NOT NULL CHECK (indice > 0),
        denticao TEXT NOT NULL CHECK (denticao IN ('permanente','decidua')),
        status TEXT NOT NULL DEFAULT 'presente' CHECK (status IN ('presente','ausente','extraido')),
        ativo INTEGER DEFAULT 1,
        criado_em TEXT DEFAULT (datetime('now','localtime')),
        atualizado_em TEXT DEFAULT (datetime('now','localtime')),
        UNIQUE (odontograma_id,profissional_id,dente_referencia_fdi,indice),
        FOREIGN KEY (odontograma_id) REFERENCES odontogramas(id),
        FOREIGN KEY (profissional_id) REFERENCES profissionais(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_odonto_elementos_odontograma
        ON odontograma_elementos(odontograma_id,profissional_id,dente_referencia_fdi,ativo)`,
      `CREATE TABLE IF NOT EXISTS odontograma_elemento_eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        elemento_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        status_anterior TEXT,
        status_novo TEXT,
        detalhes TEXT,
        registrado_por INTEGER,
        criado_em TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (elemento_id) REFERENCES odontograma_elementos(id),
        FOREIGN KEY (registrado_por) REFERENCES usuarios(id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_odonto_elemento_eventos
        ON odontograma_elemento_eventos(elemento_id,criado_em)`
    ],
    columns: [
      { table: 'odontograma_condicoes', column: 'elemento_dental_id', definition: 'INTEGER' },
      { table: 'plano_tratamento_itens', column: 'elemento_dental_id', definition: 'INTEGER' },
      { table: 'orcamento_odontologico_itens', column: 'elemento_dental_id', definition: 'INTEGER' },
      { table: 'orcamento_odontologico_itens', column: 'rotulo_dental', definition: 'TEXT' }
    ]
  });

  function install(migrations) {
    if (!migrations?.MIGRATIONS || !Array.isArray(migrations.MIGRATIONS)) throw new Error('Registro de migrations indisponível.');
    if (!migrations.MIGRATIONS.some(item => Number(item.version) === VERSION)) migrations.MIGRATIONS.push(MIGRATION);
    migrations.MIGRATIONS.sort((a, b) => Number(a.version) - Number(b.version));
    migrations.CURRENT_SCHEMA_VERSION = Math.max(Number(migrations.CURRENT_SCHEMA_VERSION) || 0, VERSION);
    return migrations;
  }

  function columnNames(database, table) {
    if (typeof database?.query === 'function') {
      try { return new Set((database.query(`PRAGMA table_info(${table})`) || []).map(row => String(row.name || Object.values(row)[1] || ''))); }
      catch (_) { return new Set(); }
    }
    if (typeof database?.exec === 'function') {
      try {
        const result = database.exec(`PRAGMA table_info(${table})`);
        return new Set((result?.[0]?.values || []).map(row => String(row[1] || '')));
      } catch (_) { return new Set(); }
    }
    return new Set();
  }

  function tableExists(database, table) {
    if (typeof database?.query === 'function') {
      try { return (database.query("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]) || []).length > 0; }
      catch (_) { return false; }
    }
    if (typeof database?.exec === 'function') {
      try {
        const escaped = String(table).replaceAll("'", "''");
        return Boolean(database.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${escaped}'`)?.[0]?.values?.length);
      } catch (_) { return false; }
    }
    return false;
  }

  function ensureColumns(database) {
    if (!database?.run) throw new Error('Database adapter is required.');
    let added = 0;
    for (const item of MIGRATION.columns) {
      if (!tableExists(database, item.table)) continue;
      if (columnNames(database, item.table).has(item.column)) continue;
      database.run(`ALTER TABLE ${item.table} ADD COLUMN ${item.column} ${item.definition}`);
      added += 1;
    }
    if (tableExists(database, 'odontograma_condicoes')) {
      database.run('CREATE INDEX IF NOT EXISTS idx_odonto_condicoes_elemento ON odontograma_condicoes(elemento_dental_id,ativo)');
    }
    if (tableExists(database, 'plano_tratamento_itens')) {
      database.run('CREATE INDEX IF NOT EXISTS idx_plano_item_elemento ON plano_tratamento_itens(elemento_dental_id)');
    }
    if (tableExists(database, 'orcamento_odontologico_itens')) {
      database.run('CREATE INDEX IF NOT EXISTS idx_orcamento_item_elemento ON orcamento_odontologico_itens(elemento_dental_id)');
    }
    return { version: VERSION, added };
  }

  return { VERSION, MIGRATION, install, ensureColumns, columnNames, tableExists };
});
