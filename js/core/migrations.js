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
    },
    {
      version: 2,
      name: 'block_a_operations',
      sql: [
        `CREATE TABLE IF NOT EXISTS financeiro_categorias (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          tipo TEXT NOT NULL CHECK (tipo IN ('receita','despesa')),
          ativo INTEGER DEFAULT 1,
          criado_em TEXT DEFAULT (datetime('now','localtime')),
          UNIQUE (nome, tipo)
        )`,
        `INSERT OR IGNORE INTO financeiro_categorias (nome,tipo) VALUES ('Consultas','receita')`,
        `INSERT OR IGNORE INTO financeiro_categorias (nome,tipo) VALUES ('Procedimentos','receita')`,
        `INSERT OR IGNORE INTO financeiro_categorias (nome,tipo) VALUES ('Outras receitas','receita')`,
        `INSERT OR IGNORE INTO financeiro_categorias (nome,tipo) VALUES ('Materiais e insumos','despesa')`,
        `INSERT OR IGNORE INTO financeiro_categorias (nome,tipo) VALUES ('Despesas operacionais','despesa')`,
        `INSERT OR IGNORE INTO financeiro_categorias (nome,tipo) VALUES ('Impostos e taxas','despesa')`,
        `CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tipo TEXT NOT NULL CHECK (tipo IN ('receita','despesa')),
          descricao TEXT NOT NULL,
          categoria_id INTEGER,
          paciente_id INTEGER,
          profissional_id INTEGER,
          agenda_id INTEGER,
          procedimento_id INTEGER,
          chave_origem TEXT UNIQUE,
          valor REAL NOT NULL CHECK (valor >= 0),
          vencimento_em TEXT,
          competencia TEXT,
          status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado')),
          forma_pagamento TEXT,
          pago_em TEXT,
          observacao TEXT,
          criado_em TEXT DEFAULT (datetime('now','localtime')),
          atualizado_em TEXT DEFAULT (datetime('now','localtime')),
          FOREIGN KEY (categoria_id) REFERENCES financeiro_categorias(id),
          FOREIGN KEY (paciente_id) REFERENCES pacientes(id),
          FOREIGN KEY (profissional_id) REFERENCES profissionais(id),
          FOREIGN KEY (agenda_id) REFERENCES agenda(id),
          FOREIGN KEY (procedimento_id) REFERENCES procedimentos(id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_financeiro_status_vencimento ON financeiro_lancamentos(status,vencimento_em)`,
        `CREATE INDEX IF NOT EXISTS idx_financeiro_paciente ON financeiro_lancamentos(paciente_id)`,
        `CREATE TABLE IF NOT EXISTS financeiro_caixa_links (
          financeiro_lancamento_id INTEGER PRIMARY KEY,
          caixa_id INTEGER NOT NULL UNIQUE,
          criado_em TEXT DEFAULT (datetime('now','localtime')),
          FOREIGN KEY (financeiro_lancamento_id) REFERENCES financeiro_lancamentos(id),
          FOREIGN KEY (caixa_id) REFERENCES caixa(id)
        )`,
        `CREATE TABLE IF NOT EXISTS financeiro_repasse_links (
          financeiro_lancamento_id INTEGER PRIMARY KEY,
          repasse_id INTEGER NOT NULL UNIQUE,
          criado_em TEXT DEFAULT (datetime('now','localtime')),
          FOREIGN KEY (financeiro_lancamento_id) REFERENCES financeiro_lancamentos(id),
          FOREIGN KEY (repasse_id) REFERENCES repasses(id)
        )`,
        `CREATE TABLE IF NOT EXISTS estoque_itens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          codigo TEXT,
          unidade TEXT DEFAULT 'un',
          fabricante TEXT,
          estoque_atual REAL DEFAULT 0 CHECK (estoque_atual >= 0),
          estoque_minimo REAL DEFAULT 0 CHECK (estoque_minimo >= 0),
          ativo INTEGER DEFAULT 1,
          criado_em TEXT DEFAULT (datetime('now','localtime')),
          atualizado_em TEXT DEFAULT (datetime('now','localtime'))
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_estoque_codigo ON estoque_itens(codigo) WHERE codigo IS NOT NULL AND codigo <> ''`,
        `CREATE TABLE IF NOT EXISTS estoque_movimentos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL,
          tipo TEXT NOT NULL,
          quantidade REAL NOT NULL,
          delta REAL NOT NULL,
          estoque_antes REAL NOT NULL,
          estoque_depois REAL NOT NULL,
          lote TEXT,
          validade TEXT,
          motivo TEXT,
          paciente_id INTEGER,
          procedimento_id INTEGER,
          agenda_id INTEGER,
          chave_origem TEXT UNIQUE,
          criado_em TEXT DEFAULT (datetime('now','localtime')),
          FOREIGN KEY (item_id) REFERENCES estoque_itens(id),
          FOREIGN KEY (paciente_id) REFERENCES pacientes(id),
          FOREIGN KEY (procedimento_id) REFERENCES procedimentos(id),
          FOREIGN KEY (agenda_id) REFERENCES agenda(id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_estoque_mov_item_data ON estoque_movimentos(item_id,criado_em)`,
        `CREATE INDEX IF NOT EXISTS idx_estoque_mov_validade ON estoque_movimentos(validade)`,
        `CREATE TABLE IF NOT EXISTS procedimento_estoque (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          procedimento_id INTEGER NOT NULL,
          item_id INTEGER NOT NULL,
          quantidade REAL NOT NULL CHECK (quantidade > 0),
          ativo INTEGER DEFAULT 1,
          UNIQUE (procedimento_id,item_id),
          FOREIGN KEY (procedimento_id) REFERENCES procedimentos(id),
          FOREIGN KEY (item_id) REFERENCES estoque_itens(id)
        )`,
        `CREATE TABLE IF NOT EXISTS crm_pacientes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          paciente_id INTEGER NOT NULL UNIQUE,
          etapa TEXT DEFAULT 'novo',
          origem TEXT,
          proximo_contato_em TEXT,
          observacao TEXT,
          atualizado_em TEXT DEFAULT (datetime('now','localtime')),
          FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_crm_pacientes_etapa ON crm_pacientes(etapa,proximo_contato_em)`,
        `CREATE TABLE IF NOT EXISTS crm_interacoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          paciente_id INTEGER NOT NULL,
          tipo TEXT NOT NULL,
          direcao TEXT DEFAULT 'saida',
          descricao TEXT,
          resultado TEXT,
          proxima_acao_em TEXT,
          usuario_id INTEGER,
          criado_em TEXT DEFAULT (datetime('now','localtime')),
          FOREIGN KEY (paciente_id) REFERENCES pacientes(id),
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_crm_interacoes_paciente ON crm_interacoes(paciente_id,criado_em)`,
        `CREATE TABLE IF NOT EXISTS crm_oportunidades (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          paciente_id INTEGER NOT NULL,
          tipo TEXT DEFAULT 'tratamento',
          titulo TEXT NOT NULL,
          valor REAL DEFAULT 0,
          etapa TEXT DEFAULT 'aberta',
          proxima_acao_em TEXT,
          observacao TEXT,
          criado_em TEXT DEFAULT (datetime('now','localtime')),
          atualizado_em TEXT DEFAULT (datetime('now','localtime')),
          FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_etapa ON crm_oportunidades(etapa,proxima_acao_em)`,
        `CREATE TABLE IF NOT EXISTS mensagens_whatsapp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          paciente_id INTEGER,
          tipo TEXT NOT NULL,
          origem_tipo TEXT NOT NULL,
          origem_id INTEGER NOT NULL,
          dedupe_key TEXT NOT NULL UNIQUE,
          telefone TEXT,
          mensagem TEXT NOT NULL,
          agendada_para TEXT,
          status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','aberta','enviada','cancelada')),
          aberta_em TEXT,
          enviada_em TEXT,
          criado_em TEXT DEFAULT (datetime('now','localtime')),
          FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_whatsapp_fila ON mensagens_whatsapp(status,agendada_para)`
      ]
    }
  ];

  const CURRENT_SCHEMA_VERSION = MIGRATIONS.at(-1).version;

  function getPendingMigrations(currentVersion) {
    const version = Number(currentVersion) || 0;
    return MIGRATIONS.filter(migration => migration.version > version);
  }

  function readUserVersion(database) {
    if (typeof database.exec === 'function') {
      const result = database.exec('PRAGMA user_version');
      return result?.[0]?.values?.[0]?.[0] || 0;
    }
    if (typeof database.query === 'function') {
      const row = database.query('PRAGMA user_version')[0];
      return Number(row?.user_version ?? Object.values(row || {})[0]) || 0;
    }
    return 0;
  }

  function applyMigration(database, migration) {
    if (typeof database.exec === 'function') {
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
      return;
    }
    migration.sql.forEach(statement => database.run(statement));
    database.run('INSERT OR REPLACE INTO schema_migrations (version,name) VALUES (?,?)', [migration.version, migration.name]);
    database.run(`PRAGMA user_version=${migration.version}`);
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
      if (typeof audit === 'function') await audit({ version: migration.version, name: migration.name });
    }
    return { from: currentVersion, to: readUserVersion(database), applied };
  }

  function hasMeaningfulData(database) {
    if (typeof database.query !== 'function') return true;
    for (const table of ['pacientes', 'agenda', 'prontuario_atendimentos', 'documentos_emitidos']) {
      try {
        const row = database.query(`SELECT COUNT(*) as c FROM ${table}`)[0];
        if (Number(row?.c) > 0) return true;
      } catch (_) { /* legacy partial schema */ }
    }
    return false;
  }

  async function ensurePlatformSchema(database, electronAPI, auditApi) {
    return runMigrations({
      database,
      beforeMigrate: async meta => {
        if (!hasMeaningfulData(database)) return { ok: true, skipped: true };
        if (!electronAPI?.criarBackupPreMigracao) return { ok: true, skipped: true };
        return electronAPI.criarBackupPreMigracao({ fromVersion: meta.from });
      },
      audit: async migration => {
        if (!auditApi?.log) return;
        auditApi.log(auditApi.systemMigrationEvent(migration.version, migration.name), { strict: true, mode: 'migration', user: null });
      }
    });
  }

  return {
    MIGRATIONS,
    CURRENT_SCHEMA_VERSION,
    getPendingMigrations,
    readUserVersion,
    applyMigration,
    runMigrations,
    hasMeaningfulData,
    ensurePlatformSchema
  };
});
