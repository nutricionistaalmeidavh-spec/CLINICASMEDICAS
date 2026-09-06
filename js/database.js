let SQL = null;
let db = null;

const DB_KEY = 'plennus_clinic_db';

async function initDatabase() {
  try {
    // Carrega sql.js
    SQL = await initSqlJs({
      locateFile: file => `node_modules/sql.js/dist/${file}`
    });

    // Tenta carregar do localStorage ou electron
    const saved = window.electronAPI ? await window.electronAPI.carregarBanco() : localStorage.getItem(DB_KEY);
    if (saved) {
      try {
        const buffer = Uint8Array.from(typeof saved === 'string' ? JSON.parse(saved) : saved);
        db = new SQL.Database(buffer);
        migrateSchema();
        await seedData();
        console.log('Banco carregado e migrado com sucesso');
      } catch (e) {
        console.warn('Erro ao carregar banco salvo, criando novo:', e);
        db = new SQL.Database();
        createTables();
        migrateSchema();
        await seedData();
        saveDatabase();
      }
    } else {
      db = new SQL.Database();
      createTables();
      migrateSchema();
      await seedData();
      saveDatabase();
      console.log('Novo banco criado');
    }
    return db;
  } catch (err) {
    console.error('Erro fatal no initDatabase:', err);
    throw err;
  }
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      usuario TEXT UNIQUE NOT NULL,
      senha TEXT NOT NULL,
      nivel TEXT DEFAULT 'admin',
      ativo INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS pacientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cpf TEXT,
      data_nascimento TEXT,
      celular TEXT,
      telefone TEXT,
      email TEXT,
      cep TEXT,
      logradouro TEXT,
      numero TEXT,
      bairro TEXT,
      cidade TEXT,
      uf TEXT,
      observacoes TEXT,
      ativo INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS profissionais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      especialidade TEXT,
      crm TEXT,
      telefone TEXT,
      percentual_repasse REAL DEFAULT 30,
      ativo INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS convenios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      codigo TEXT,
      telefone TEXT,
      contato TEXT,
      ativo INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS procedimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      valor_particular REAL DEFAULT 0,
      ativo INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS agenda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paciente_id INTEGER,
      profissional_id INTEGER,
      data TEXT NOT NULL,
      hora TEXT NOT NULL,
      status TEXT DEFAULT 'agendado',
      observacao TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS grade_horarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profissional_id INTEGER,
      dia_semana INTEGER,
      hora_inicio TEXT,
      hora_fim TEXT,
      intervalo_minutos INTEGER DEFAULT 30
    );

    CREATE TABLE IF NOT EXISTS caixa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      descricao TEXT,
      valor REAL NOT NULL,
      forma_pagamento TEXT,
      data TEXT DEFAULT (datetime('now','localtime')),
      observacao TEXT
    );

    CREATE TABLE IF NOT EXISTS repasses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profissional_id INTEGER,
      periodo_inicio TEXT,
      periodo_fim TEXT,
      valor_bruto REAL,
      percentual REAL,
      valor_repasse REAL,
      data_pagamento TEXT,
      status TEXT DEFAULT 'pendente',
      criado_em TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS prontuario_atendimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paciente_id INTEGER NOT NULL,
      profissional_id INTEGER NOT NULL,
      data_hora TEXT NOT NULL,
      tipo_atendimento TEXT DEFAULT 'Consulta',
      subjetivo_queixa TEXT,
      objetivo_exame TEXT,
      pressao_arterial TEXT,
      frequencia_cardiaca TEXT,
      temperatura TEXT,
      peso REAL,
      altura REAL,
      imc REAL,
      avaliacao_diagnostico TEXT,
      cid10 TEXT,
      plano_conduta TEXT,
      prescricao_medicamentos TEXT,
      finalizado INTEGER DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS documentos_emitidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      paciente_id INTEGER NOT NULL,
      profissional_id INTEGER NOT NULL,
      titulo TEXT,
      conteudo TEXT,
      data_emissao TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS documentos_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tipo TEXT,
      conteudo TEXT,
      ativo INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS arquivos_clinicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paciente_id INTEGER NOT NULL,
      categoria TEXT NOT NULL,
      nome_arquivo TEXT NOT NULL,
      caminho_arquivo TEXT,
      mime_type TEXT,
      observacao TEXT,
      data_registro TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
    );

    CREATE TABLE IF NOT EXISTS consentimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paciente_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      autorizado INTEGER DEFAULT 0,
      aceito_em TEXT,
      revogado_em TEXT,
      observacao TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      atualizado_em TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
    );

    CREATE TABLE IF NOT EXISTS exames_laboratoriais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paciente_id INTEGER NOT NULL,
      data_coleta TEXT,
      laboratorio TEXT,
      status_revisao TEXT DEFAULT 'pendente',
      observacao TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
    );

    CREATE TABLE IF NOT EXISTS exames_resultados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exame_id INTEGER NOT NULL,
      marcador TEXT NOT NULL,
      valor REAL,
      valor_texto TEXT,
      unidade TEXT,
      referencia_min REAL,
      referencia_max REAL,
      referencia_texto TEXT,
      FOREIGN KEY (exame_id) REFERENCES exames_laboratoriais(id)
    );

    CREATE TABLE IF NOT EXISTS pendencias_clinicas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paciente_id INTEGER NOT NULL,
      tipo TEXT DEFAULT 'manual',
      titulo TEXT NOT NULL,
      descricao TEXT,
      origem_tipo TEXT,
      origem_id INTEGER,
      status TEXT DEFAULT 'aberta',
      vencimento_em TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      resolvido_em TEXT,
      FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
    );

    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );
  `);
}

function addColumnIfNotExists(table, column, definition) {
  try {
    const info = db.exec(`PRAGMA table_info(${table})`);
    if (info && info[0] && info[0].values) {
      const cols = info[0].values.map(c => c[1]);
      if (!cols.includes(column)) {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    }
  } catch (e) {
    console.warn(`Aviso ao checar coluna ${column} em ${table}:`, e);
  }
}

function migrateSchema() {
  createTables();
  addColumnIfNotExists('pacientes', 'alergias', 'TEXT');
  addColumnIfNotExists('pacientes', 'comorbidades', 'TEXT');
  addColumnIfNotExists('pacientes', 'medicamentos_continuos', 'TEXT');
  addColumnIfNotExists('pacientes', 'tipo_sanguineo', 'TEXT');
  addColumnIfNotExists('pacientes', 'sexo', 'TEXT');
  addColumnIfNotExists('profissionais', 'uf_crm', "TEXT DEFAULT 'SP'");
  addColumnIfNotExists('profissionais', 'tipo_conselho', "TEXT DEFAULT 'CRM'");
  addColumnIfNotExists('agenda', 'chegada_em', 'TEXT');
  addColumnIfNotExists('agenda', 'procedimento_id', 'INTEGER');
  addColumnIfNotExists('agenda', 'convenio_id', 'INTEGER');
  saveDatabase();
}

async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function generateTemporaryPassword() {
  const values = new Uint32Array(3);
  crypto.getRandomValues(values);
  return Array.from(values).map(value => value.toString(36)).join('-').slice(0, 16);
}

async function seedData() {
  // Usuários padrão
  const existe = db.exec("SELECT COUNT(*) as c FROM usuarios");
  if (existe[0].values[0][0] === 0) {
    const defaultPassHash = await hashPassword('123');
    db.run(`INSERT INTO usuarios (nome, usuario, senha, nivel) VALUES ('Administrador', 'admin', ?, 'admin')`, [defaultPassHash]);
    db.run(`INSERT INTO usuarios (nome, usuario, senha, nivel) VALUES ('Dr. Roberto Mendes', 'medico', ?, 'medico')`, [defaultPassHash]);
    db.run(`INSERT INTO usuarios (nome, usuario, senha, nivel) VALUES ('Recepção Central', 'recepcao', ?, 'recepcao')`, [defaultPassHash]);
  }

  // Templates de documentos
  const templatesExist = db.exec("SELECT COUNT(*) as c FROM documentos_templates");
  if (templatesExist[0].values[0][0] === 0) {
    const templates = [
      ['Receituário Simples', 'receituario',
       'RECEITUÁRIO MÉDICO\n\nPaciente: {paciente_nome}\nCPF: {paciente_cpf}\nData: {data}\n\nUso Oral:\n1) Dipirona 500mg ------------------ 1 cx\n   Tomar 1 comprimido de 6/6 horas em caso de dor ou febre.\n\n2) Amoxicilina 500mg -------------- 2 cx\n   Tomar 1 cápsula de 8/8 horas por 7 dias.\n\n_______________________________\nDr(a). {profissional_nome}\n{profissional_crm}'],
      ['Receituário de Controle Especial (2 Vias)', 'controle_especial',
       'RECEITUÁRIO DE CONTROLE ESPECIAL (1ª VIA FARMÁCIA / 2ª VIA PACIENTE)\n\nEMITENTE: {nome_clinica}\nEndereço: {endereco_clinica} | Tel: {telefone_clinica}\n\nPACIENTE: {paciente_nome}\nEndereço: {paciente_endereco}\nCPF: {paciente_cpf}\n\nPRESCRIÇÃO:\n1) Clonazepam 2mg ---------------- 1 cx\n   Tomar 1 comprimido à noite por 30 dias.\n\nData: {data}\n\n_______________________________\nDr(a). {profissional_nome}\n{profissional_crm}'],
      ['Atestado Médico', 'atestado',
       'ATESTADO MÉDICO\n\nAtesto para os devidos fins que o(a) paciente {paciente_nome}, portador(a) do CPF {paciente_cpf}, esteve sob meus cuidados profissionais no dia {data}, necessitando de repouso e afastamento de suas atividades por ____ dias.\n\nCID-10: ( ) A pedido do paciente: _______\n\n_______________________________\nDr(a). {profissional_nome}\n{profissional_crm}'],
      ['Pedido de Exames', 'exames',
       'SOLICITAÇÃO DE EXAMES COMPLEMENTARES\n\nPaciente: {paciente_nome}\nData: {data}\n\nSolicito a realização dos seguintes exames:\n- Hemograma Completo com Plaquetas\n- Glicemia de Jejum\n- Perfil Lipídico (Colesterol Total e Frações, Triglicerídeos)\n- Creatinina e Ureia\n- TSH e T4 Livre\n\nIndicação Clínica: Avaliação de rotina / Check-up.\n\n_______________________________\nDr(a). {profissional_nome}\n{profissional_crm}'],
      ['Encaminhamento Especializado', 'encaminhamento',
       'ENCAMINHAMENTO MÉDICO\n\nAo(À) colega Especialista em ________________________,\n\nEncaminho o(a) paciente {paciente_nome}, CPF {paciente_cpf}, para avaliação e conduta conjunta especializada.\n\nHistórico / Motivo do encaminhamento:\n\n\nData: {data}\n\n_______________________________\nDr(a). {profissional_nome}\n{profissional_crm}'],
      ['Declaração de Comparecimento', 'declaracao',
       'DECLARAÇÃO DE COMPARECIMENTO\n\nDeclaro para os devidos fins que o(a) Sr(a). {paciente_nome}, CPF {paciente_cpf}, compareceu a esta clínica no dia {data}, no horário das _____ às _____, para consulta médica.\n\n_______________________________\nDr(a). {profissional_nome}\n{profissional_crm}']
    ];
    templates.forEach(t => {
      db.run(`INSERT INTO documentos_templates (nome, tipo, conteudo) VALUES (?, ?, ?)`, t);
    });
  }

  // Configurações padrão da clínica
  const configKeys = [
    ['nome_clinica', 'Plennus Clinic – Gestão Médica'],
    ['endereco_clinica', 'Av. Paulista, 1000, Cj. 42 – Bela Vista'],
    ['telefone_clinica', '(11) 3456-7890 / (11) 98765-4321'],
    ['cidade_clinica', 'São Paulo - SP'],
    ['cnpj_clinica', '12.345.678/0001-90'],
    ['cor_primaria', '#C41E3A']
  ];

  configKeys.forEach(([chave, valor]) => {
    const existeCfg = db.exec(`SELECT COUNT(*) as c FROM configuracoes WHERE chave='${chave}'`);
    if (existeCfg[0].values[0][0] === 0) {
      db.run(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?)`, [chave, valor]);
    }
  });
}

function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Array.from(data);
  if (window.electronAPI) {
    window.electronAPI.salvarBanco(buffer).then(result => {
      if (!result.ok) console.error('Falha ao criptografar o banco local.');
    });
  } else {
    localStorage.setItem(DB_KEY, JSON.stringify(buffer));
  }
}

function query(sql, params = []) {
  if (!db) throw new Error('Banco de dados não inicializado');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  if (!db) throw new Error('Banco de dados não inicializado');
  db.run(sql, params);
  saveDatabase();
  return db.getRowsModified();
}

function getLastId() {
  return db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
}

function validateDatabaseCandidate(data) {
  if (!SQL) throw new Error('Banco de dados ainda não está pronto.');
  const candidate = new SQL.Database(new Uint8Array(data));
  try {
    const integrity = candidate.exec('PRAGMA integrity_check');
    const integrityOk = integrity?.[0]?.values?.[0]?.[0] === 'ok';
    if (!integrityOk) throw new Error('Falha na verificação de integridade do banco.');

    const tableResult = candidate.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const tables = new Set((tableResult?.[0]?.values || []).map(row => row[0]));
    for (const required of ['usuarios', 'pacientes', 'agenda', 'configuracoes']) {
      if (!tables.has(required)) throw new Error(`Backup incompatível: tabela ${required} ausente.`);
    }
    return candidate;
  } catch (error) {
    candidate.close();
    throw error;
  }
}

async function restoreValidatedDatabase(data) {
  const candidate = validateDatabaseCandidate(data);
  const exported = Array.from(candidate.export());
  try {
    if (window.electronAPI) {
      const result = await window.electronAPI.salvarBanco(exported);
      if (!result?.ok) throw new Error('Não foi possível persistir o banco restaurado.');
    } else {
      localStorage.setItem(DB_KEY, JSON.stringify(exported));
    }
    const previous = db;
    db = candidate;
    if (previous && previous !== candidate) previous.close();
    return { ok: true };
  } catch (error) {
    candidate.close();
    throw error;
  }
}

// Export helpers
window.DB = {
  init: initDatabase,
  query,
  run,
  save: saveDatabase,
  getLastId,
  export: () => db ? db.export() : null,
  validateBackup: validateDatabaseCandidate,
  restoreValidated: restoreValidatedDatabase,
  load: restoreValidatedDatabase,
  isReady: () => !!db
};

window.hashPassword = hashPassword;
