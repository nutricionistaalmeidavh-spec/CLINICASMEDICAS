(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlennusDataIsolation = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const ROLES = Object.freeze({ ADMIN: 'admin', PROFESSIONAL: 'medico', RECEPTION: 'recepcao' });

  const CLINICAL_TABLES = new Set([
    'prontuario_atendimentos',
    'documentos_emitidos',
    'arquivos_clinicos',
    'consentimentos',
    'exames_laboratoriais',
    'exames_resultados',
    'pendencias_clinicas',
    'odontogramas',
    'odontograma_condicoes',
    'odontograma_elementos',
    'odontograma_elemento_eventos',
    'planos_tratamento',
    'plano_tratamento_itens',
    'orcamentos_odontologicos',
    'orcamento_odontologico_itens'
  ]);

  const SHARED_MIRROR_TABLES = Object.freeze([
    'pacientes',
    'profissionais',
    'procedimentos',
    'convenios',
    'configuracoes',
    'documentos_templates',
    'agenda',
    'grade_horarios'
  ]);

  function normalizeIdentifier(value) {
    return String(value || '')
      .replace(/^[`"\[]|[`"\]]$/g, '')
      .split('.')
      .pop()
      .trim()
      .toLowerCase();
  }

  function extractSqlTables(sql) {
    const text = String(sql || '');
    const tables = new Set();
    const patterns = [
      /\bfrom\s+([`"\[]?[\w.]+[`"\]]?)/gi,
      /\bjoin\s+([`"\[]?[\w.]+[`"\]]?)/gi,
      /\bupdate\s+([`"\[]?[\w.]+[`"\]]?)/gi,
      /\binsert\s+(?:or\s+\w+\s+)?into\s+([`"\[]?[\w.]+[`"\]]?)/gi,
      /\bdelete\s+from\s+([`"\[]?[\w.]+[`"\]]?)/gi,
      /\b(?:create|alter|drop)\s+table\s+(?:if\s+(?:not\s+)?exists\s+)?([`"\[]?[\w.]+[`"\]]?)/gi
    ];
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text))) {
        const table = normalizeIdentifier(match[1]);
        if (table) tables.add(table);
      }
    });
    return [...tables];
  }

  function touchesClinicalTable(sql) {
    return extractSqlTables(sql).some(table => CLINICAL_TABLES.has(table));
  }

  function canUseClinicalDatabase(role) {
    return role === ROLES.PROFESSIONAL;
  }

  function tableInfo(database, table) {
    try {
      return database.query(`PRAGMA table_info(${table})`) || [];
    } catch (_) {
      return [];
    }
  }

  function tableExists(database, table) {
    try {
      const rows = database.query("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]);
      return rows.length > 0;
    } catch (_) {
      return false;
    }
  }

  function hasColumn(database, table, column) {
    return tableInfo(database, table).some(row => String(row.name || Object.values(row)[1] || '') === column);
  }

  function addColumnIfMissing(database, table, column, definition) {
    if (!tableExists(database, table)) return false;
    const columns = tableInfo(database, table).map(row => String(row.name || Object.values(row)[1] || ''));
    if (columns.includes(column)) return false;
    database.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return true;
  }

  function ensureIsolationSchema(database) {
    if (!database?.query || !database?.run) throw new Error('Database adapter is required');

    database.run(`CREATE TABLE IF NOT EXISTS data_isolation_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      professional_id INTEGER NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ready',
      patient_count INTEGER DEFAULT 0,
      clinical_record_count INTEGER DEFAULT 0,
      summary TEXT,
      migrated_at TEXT DEFAULT (datetime('now','localtime'))
    )`);

    addColumnIfMissing(database, 'usuarios', 'uid', 'TEXT');
    addColumnIfMissing(database, 'usuarios', 'profissional_id', 'INTEGER');
    addColumnIfMissing(database, 'profissionais', 'uid', 'TEXT');
    addColumnIfMissing(database, 'pacientes', 'uid', 'TEXT');

    if (tableExists(database, 'usuarios')) {
      database.run("UPDATE usuarios SET uid=lower(hex(randomblob(16))) WHERE uid IS NULL OR trim(uid)=''");
      database.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_uid ON usuarios(uid)');
    }
    if (tableExists(database, 'profissionais')) {
      database.run("UPDATE profissionais SET uid=lower(hex(randomblob(16))) WHERE uid IS NULL OR trim(uid)=''");
      database.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_profissionais_uid ON profissionais(uid)');
    }
    if (tableExists(database, 'pacientes')) {
      database.run("UPDATE pacientes SET uid=lower(hex(randomblob(16))) WHERE uid IS NULL OR trim(uid)=''");
      database.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_pacientes_uid ON pacientes(uid)');
    }

    if (tableExists(database, 'usuarios') && tableExists(database, 'profissionais')) {
      database.run(`INSERT INTO profissionais (nome, especialidade, ativo)
        SELECT u.nome, 'Profissional', 1
        FROM usuarios u
        WHERE u.nivel='medico'
          AND u.profissional_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM profissionais p
            WHERE lower(trim(p.nome))=lower(trim(u.nome))
          )`);
      database.run(`UPDATE profissionais
        SET uid=lower(hex(randomblob(16)))
        WHERE uid IS NULL OR trim(uid)=''`);
      database.run(`UPDATE usuarios
        SET profissional_id=(
          SELECT p.id FROM profissionais p
          WHERE lower(trim(p.nome))=lower(trim(usuarios.nome))
          ORDER BY p.id LIMIT 1
        )
        WHERE nivel='medico' AND profissional_id IS NULL`);
      database.run('CREATE INDEX IF NOT EXISTS idx_usuarios_profissional ON usuarios(profissional_id)');
    }

    if (tableExists(database, 'configuracoes')) {
      database.run(`INSERT OR IGNORE INTO configuracoes (chave,valor)
        VALUES ('clinic_uid', lower(hex(randomblob(16))))`);
      database.run(`INSERT OR REPLACE INTO configuracoes (chave,valor)
        VALUES ('data_isolation_version','1')`);
    }

    return { version: 1 };
  }

  function queryIds(database, sql, params = []) {
    try {
      return database.query(sql, params)
        .map(row => Number(row.id ?? Object.values(row)[0]))
        .filter(Number.isInteger);
    } catch (_) {
      return [];
    }
  }

  function professionalPatientIds(database, professionalId) {
    const id = Number(professionalId);
    if (!Number.isInteger(id) || id <= 0) return [];
    const patientIds = new Set();
    const queries = [
      ['SELECT DISTINCT paciente_id AS id FROM agenda WHERE profissional_id=? AND paciente_id IS NOT NULL', [id]],
      ['SELECT DISTINCT paciente_id AS id FROM prontuario_atendimentos WHERE profissional_id=?', [id]],
      ['SELECT DISTINCT paciente_id AS id FROM documentos_emitidos WHERE profissional_id=?', [id]],
      ['SELECT DISTINCT paciente_id AS id FROM planos_tratamento WHERE profissional_id=?', [id]]
    ];
    queries.forEach(([sql, params]) => queryIds(database, sql, params).forEach(value => patientIds.add(value)));
    return [...patientIds].sort((a, b) => a - b);
  }

  function countRows(database, table, where = '', params = []) {
    if (!tableExists(database, table)) return 0;
    try {
      const row = database.query(`SELECT COUNT(*) AS c FROM ${table}${where ? ` WHERE ${where}` : ''}`, params)[0];
      return Number(row?.c ?? Object.values(row || {})[0]) || 0;
    } catch (_) {
      return 0;
    }
  }

  function buildProfessionalMigrationSummary(database, professionalId) {
    const patientIds = professionalPatientIds(database, professionalId);
    const recordCount = [
      countRows(database, 'prontuario_atendimentos', 'profissional_id=?', [professionalId]),
      countRows(database, 'documentos_emitidos', 'profissional_id=?', [professionalId]),
      countRows(database, 'planos_tratamento', 'profissional_id=?', [professionalId])
    ].reduce((sum, value) => sum + value, 0);
    return { professionalId: Number(professionalId), patientIds, patientCount: patientIds.length, clinicalRecordCount: recordCount };
  }

  function executeIfTable(database, table, sql, params = []) {
    if (tableExists(database, table)) database.run(sql, params);
  }

  function pruneProfessionalDatabase(database, professionalId, allowedPatientIds) {
    const professional = Number(professionalId);
    if (!Number.isInteger(professional) || professional <= 0) throw new Error('professionalId inválido');
    const patients = [...new Set((allowedPatientIds || []).map(Number).filter(Number.isInteger))];

    database.run('PRAGMA foreign_keys=OFF');
    database.run('CREATE TEMP TABLE IF NOT EXISTS __plennus_allowed_patients (id INTEGER PRIMARY KEY)');
    database.run('DELETE FROM __plennus_allowed_patients');
    patients.forEach(id => database.run('INSERT OR IGNORE INTO __plennus_allowed_patients (id) VALUES (?)', [id]));

    executeIfTable(database, 'prontuario_atendimentos', 'DELETE FROM prontuario_atendimentos WHERE profissional_id IS NULL OR profissional_id<>?', [professional]);
    executeIfTable(database, 'documentos_emitidos', 'DELETE FROM documentos_emitidos WHERE profissional_id IS NULL OR profissional_id<>?', [professional]);
    executeIfTable(database, 'planos_tratamento', 'DELETE FROM planos_tratamento WHERE profissional_id IS NULL OR profissional_id<>?', [professional]);

    executeIfTable(database, 'plano_tratamento_itens', `DELETE FROM plano_tratamento_itens
      WHERE plano_id NOT IN (SELECT id FROM planos_tratamento)`);
    executeIfTable(database, 'orcamentos_odontologicos', `DELETE FROM orcamentos_odontologicos
      WHERE plano_id NOT IN (SELECT id FROM planos_tratamento)`);
    executeIfTable(database, 'orcamento_odontologico_itens', `DELETE FROM orcamento_odontologico_itens
      WHERE orcamento_id NOT IN (SELECT id FROM orcamentos_odontologicos)`);

    const patientTables = [
      'arquivos_clinicos', 'consentimentos', 'exames_laboratoriais', 'pendencias_clinicas', 'odontogramas'
    ];
    patientTables.forEach(table => executeIfTable(database, table,
      `DELETE FROM ${table} WHERE paciente_id NOT IN (SELECT id FROM __plennus_allowed_patients)`));

    executeIfTable(database, 'exames_resultados', `DELETE FROM exames_resultados
      WHERE exame_id NOT IN (SELECT id FROM exames_laboratoriais)`);

    executeIfTable(database, 'odontograma_elementos', `DELETE FROM odontograma_elementos
      WHERE odontograma_id NOT IN (SELECT id FROM odontogramas)
         OR profissional_id IS NULL OR profissional_id<>?`, [professional]);
    executeIfTable(database, 'odontograma_elemento_eventos', `DELETE FROM odontograma_elemento_eventos
      WHERE elemento_id NOT IN (SELECT id FROM odontograma_elementos)`);
    executeIfTable(database, 'odontograma_condicoes', `DELETE FROM odontograma_condicoes
      WHERE odontograma_id NOT IN (SELECT id FROM odontogramas)`);

    if (hasColumn(database, 'odontograma_condicoes', 'elemento_dental_id') && tableExists(database, 'odontograma_elementos')) {
      database.run(`UPDATE odontograma_condicoes SET elemento_dental_id=NULL
        WHERE elemento_dental_id IS NOT NULL
          AND elemento_dental_id NOT IN (SELECT id FROM odontograma_elementos)`);
    }
    if (hasColumn(database, 'plano_tratamento_itens', 'elemento_dental_id') && tableExists(database, 'odontograma_elementos')) {
      database.run(`UPDATE plano_tratamento_itens SET elemento_dental_id=NULL
        WHERE elemento_dental_id IS NOT NULL
          AND elemento_dental_id NOT IN (SELECT id FROM odontograma_elementos)`);
    }
    if (hasColumn(database, 'orcamento_odontologico_itens', 'elemento_dental_id') && tableExists(database, 'odontograma_elementos')) {
      database.run(`UPDATE orcamento_odontologico_itens SET elemento_dental_id=NULL
        WHERE elemento_dental_id IS NOT NULL
          AND elemento_dental_id NOT IN (SELECT id FROM odontograma_elementos)`);
    }

    if (tableExists(database, 'usuarios')) database.run("UPDATE usuarios SET senha='' WHERE senha IS NOT NULL");
    executeIfTable(database, 'audit_log', 'DELETE FROM audit_log');
    executeIfTable(database, 'import_history', 'DELETE FROM import_history');

    database.run('DROP TABLE IF EXISTS __plennus_allowed_patients');
    database.run('PRAGMA foreign_keys=ON');
    return { professionalId: professional, patientCount: patients.length };
  }

  return {
    ROLES,
    CLINICAL_TABLES,
    SHARED_MIRROR_TABLES,
    normalizeIdentifier,
    extractSqlTables,
    touchesClinicalTable,
    canUseClinicalDatabase,
    tableExists,
    hasColumn,
    ensureIsolationSchema,
    professionalPatientIds,
    buildProfessionalMigrationSummary,
    pruneProfessionalDatabase
  };
});
