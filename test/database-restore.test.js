const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');

async function withDatabaseModule(run) {
  const previousWindow = global.window;
  const previousInit = global.initSqlJs;
  global.window = {
    electronAPI: {
      carregarBanco: async () => null,
      salvarBanco: async () => ({ ok: true })
    }
  };
  global.initSqlJs = initSqlJs;
  const modulePath = require.resolve('../js/database.js');
  delete require.cache[modulePath];
  require(modulePath);
  await global.window.DB.init();
  try {
    await run(global.window.DB);
  } finally {
    delete require.cache[modulePath];
    if (previousWindow === undefined) delete global.window; else global.window = previousWindow;
    if (previousInit === undefined) delete global.initSqlJs; else global.initSqlJs = previousInit;
  }
}

async function compatibleBackup() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT);
    CREATE TABLE pacientes (id INTEGER PRIMARY KEY, nome TEXT);
    CREATE TABLE agenda (id INTEGER PRIMARY KEY, data TEXT);
    CREATE TABLE configuracoes (chave TEXT PRIMARY KEY, valor TEXT);
    INSERT INTO pacientes (id,nome) VALUES (42,'Backup Validado');
  `);
  const bytes = db.export();
  db.close();
  return bytes;
}

test('validated restore swaps database only after integrity and contract checks', async () => {
  await withDatabaseModule(async DB => {
    const result = await DB.restoreValidated(await compatibleBackup());
    assert.deepEqual(result, { ok: true });
    assert.equal(DB.query('SELECT nome FROM pacientes WHERE id=42')[0].nome, 'Backup Validado');
  });
});

test('validated restore rejects structurally incompatible SQLite backups', async () => {
  await withDatabaseModule(async DB => {
    const SQL = await initSqlJs();
    const invalid = new SQL.Database();
    invalid.run('CREATE TABLE qualquer (id INTEGER PRIMARY KEY)');
    const bytes = invalid.export();
    invalid.close();
    await assert.rejects(() => DB.restoreValidated(bytes), /tabela usuarios ausente/i);
  });
});
