const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const MAX_DATABASE_BYTES = 128 * 1024 * 1024;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password || ''), 'utf8').digest('hex');
}

function sanitizeSegment(value) {
  const safe = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) throw new Error('Identificador local inválido.');
  return safe.slice(0, 96);
}

function validateDatabaseArray(data) {
  if (!Array.isArray(data) || data.length === 0 || data.length > MAX_DATABASE_BYTES) {
    throw new Error('Conteúdo de banco local inválido.');
  }
  for (let index = 0; index < Math.min(data.length, 64); index += 1) {
    const value = data[index];
    if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error('Conteúdo de banco local inválido.');
  }
  return data;
}

function installLocalDataIsolation({ app, ipcMain, safeStorage, logger = console } = {}) {
  if (!app || !ipcMain || !safeStorage) throw new Error('Electron dependencies are required');
  const sessions = new Map();
  let SQLPromise = null;

  function dataRoot() {
    return path.join(app.getPath('userData'), 'data');
  }

  function clinicDirectory() {
    return path.join(dataRoot(), 'clinic');
  }

  function clinicPath() {
    return path.join(clinicDirectory(), 'clinic.db.enc');
  }

  function legacyPath() {
    return path.join(app.getPath('userData'), 'plennus-clinic.db.enc');
  }

  function professionalDirectory(session) {
    const identity = sanitizeSegment(session.professionalUid || `id-${session.professionalId}`);
    return path.join(dataRoot(), 'professionals', identity);
  }

  function professionalPath(session) {
    return path.join(professionalDirectory(session), 'clinical.db.enc');
  }

  function ensureEncryption() {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia do sistema operacional indisponível.');
  }

  function ensureClinicCanonicalCopy() {
    const target = clinicPath();
    if (fs.existsSync(target)) return;
    const source = legacyPath();
    if (!fs.existsSync(source)) return;
    fs.mkdirSync(clinicDirectory(), { recursive: true });
    fs.copyFileSync(source, target);
    try { fs.chmodSync(target, 0o600); } catch (_) { /* Windows pode ignorar chmod */ }
  }

  function readEncryptedDatabase(filePath) {
    if (!fs.existsSync(filePath)) return null;
    ensureEncryption();
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_DATABASE_BYTES * 6) {
      throw new Error('Arquivo de banco local inválido.');
    }
    const encrypted = fs.readFileSync(filePath);
    const data = JSON.parse(safeStorage.decryptString(encrypted));
    return validateDatabaseArray(data);
  }

  function writeEncryptedDatabase(filePath, data) {
    ensureEncryption();
    const bytes = validateDatabaseArray(data);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(bytes));
    const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temp, encrypted, { mode: 0o600 });
    fs.renameSync(temp, filePath);
    try { fs.chmodSync(filePath, 0o600); } catch (_) { /* Windows pode ignorar chmod */ }
    return { ok: true };
  }

  async function getSQL() {
    if (!SQLPromise) SQLPromise = initSqlJs();
    return SQLPromise;
  }

  function pruneExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
      if (now - session.lastSeenAt > SESSION_TTL_MS) sessions.delete(token);
    }
  }

  function requireSession(event, token, { professional = false } = {}) {
    pruneExpiredSessions();
    const session = sessions.get(String(token || ''));
    if (!session) throw new Error('Sessão local expirada ou inválida.');
    if (session.senderId !== event.sender.id) throw new Error('Sessão local não pertence a esta janela.');
    if (professional && (session.role !== 'medico' || !session.professionalId)) {
      throw new Error('Sessão sem acesso a banco clínico profissional.');
    }
    session.lastSeenAt = Date.now();
    return session;
  }

  async function authenticateUser(username, password, senderId) {
    ensureClinicCanonicalCopy();
    const bytes = readEncryptedDatabase(clinicPath());
    if (!bytes) return { ok: false, error: 'Banco da clínica ainda não foi inicializado.' };
    const SQL = await getSQL();
    const database = new SQL.Database(new Uint8Array(bytes));
    try {
      let rows;
      try {
        const stmt = database.prepare(`SELECT u.id,u.nome,u.usuario,u.senha,u.nivel,u.ativo,u.profissional_id,
          p.uid AS professional_uid
          FROM usuarios u
          LEFT JOIN profissionais p ON p.id=u.profissional_id
          WHERE u.usuario=? AND u.ativo=1 LIMIT 1`);
        stmt.bind([String(username || '').trim()]);
        rows = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();
      } catch (_) {
        const stmt = database.prepare(`SELECT id,nome,usuario,senha,nivel,ativo,NULL AS profissional_id,NULL AS professional_uid
          FROM usuarios WHERE usuario=? AND ativo=1 LIMIT 1`);
        stmt.bind([String(username || '').trim()]);
        rows = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();
      }
      if (!rows) return { ok: false, error: 'Usuário ou senha inválidos.' };

      const supplied = String(password || '');
      const stored = String(rows.senha || '');
      const suppliedHash = hashPassword(supplied);
      const passwordOk = stored === suppliedHash || stored === supplied;
      if (!passwordOk) return { ok: false, error: 'Usuário ou senha inválidos.' };

      if (stored === supplied && stored !== suppliedHash) {
        database.run('UPDATE usuarios SET senha=? WHERE id=?', [suppliedHash, rows.id]);
        writeEncryptedDatabase(clinicPath(), Array.from(database.export()));
      }

      if (rows.nivel === 'medico' && !Number(rows.profissional_id)) {
        return { ok: false, error: 'Este usuário profissional ainda não está vinculado a um cadastro de profissional.' };
      }

      const token = crypto.randomBytes(32).toString('hex');
      const session = {
        token,
        userId: Number(rows.id),
        role: rows.nivel || 'admin',
        professionalId: rows.profissional_id ? Number(rows.profissional_id) : null,
        professionalUid: rows.professional_uid || null,
        senderId,
        createdAt: Date.now(),
        lastSeenAt: Date.now()
      };
      sessions.set(token, session);
      return {
        ok: true,
        user: {
          id: Number(rows.id),
          nome: rows.nome,
          usuario: rows.usuario,
          nivel: session.role,
          profissional_id: session.professionalId,
          ativo: Number(rows.ativo)
        },
        session: {
          token,
          userId: session.userId,
          role: session.role,
          professionalId: session.professionalId,
          professionalUid: session.professionalUid
        }
      };
    } finally {
      database.close();
    }
  }

  ipcMain.handle('data-isolation:load-clinic', () => {
    try {
      ensureClinicCanonicalCopy();
      return { ok: true, data: readEncryptedDatabase(clinicPath()) };
    } catch (error) {
      logger.error('Falha ao carregar clinic.db:', error);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('data-isolation:save-clinic', (_event, data) => {
    try {
      return writeEncryptedDatabase(clinicPath(), data);
    } catch (error) {
      logger.error('Falha ao salvar clinic.db:', error);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('data-isolation:authenticate', async (event, credentials = {}) => {
    try {
      return await authenticateUser(credentials.username, credentials.password, event.sender.id);
    } catch (error) {
      logger.error('Falha na autenticação local:', error);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('data-isolation:load-professional', (event, token) => {
    try {
      const session = requireSession(event, token, { professional: true });
      return { ok: true, data: readEncryptedDatabase(professionalPath(session)) };
    } catch (error) {
      logger.warn('Banco profissional recusado:', error.message);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('data-isolation:save-professional', (event, token, data) => {
    try {
      const session = requireSession(event, token, { professional: true });
      return writeEncryptedDatabase(professionalPath(session), data);
    } catch (error) {
      logger.warn('Persistência profissional recusada:', error.message);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('data-isolation:end-session', (event, token) => {
    try {
      const session = requireSession(event, token);
      sessions.delete(session.token);
      return { ok: true };
    } catch (_) {
      return { ok: true };
    }
  });

  return {
    clinicPath,
    professionalPath,
    hashPassword,
    sanitizeSegment,
    sessions
  };
}

module.exports = {
  MAX_DATABASE_BYTES,
  SESSION_TTL_MS,
  hashPassword,
  sanitizeSegment,
  validateDatabaseArray,
  installLocalDataIsolation
};