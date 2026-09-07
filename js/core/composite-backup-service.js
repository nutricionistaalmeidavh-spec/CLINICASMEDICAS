const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const initSqlJs = require('sql.js');
const backupFormat = require('./backup-format');
const inventory = require('./composite-backup-main');

const MAX_ENCRYPTED_BACKUP_FILE_BYTES = 768 * 1024 * 1024;
const CLINIC_REQUIRED_TABLES = ['configuracoes', 'usuarios', 'profissionais', 'pacientes', 'agenda'];
const PROFESSIONAL_REQUIRED_TABLES = ['pacientes', 'prontuario_atendimentos', 'arquivos_clinicos'];

function safeRm(target) {
  if (!target) return;
  try { fs.rmSync(target, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

function ensureSafeStorage(safeStorage) {
  if (!safeStorage?.isEncryptionAvailable?.()) throw new Error('Criptografia do sistema operacional indisponível.');
}

function atomicWrite(filePath, data, options = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.writeFileSync(temp, data, options);
    try { fs.chmodSync(temp, 0o600); } catch (_) { /* Windows */ }
    fs.renameSync(temp, filePath);
    try { fs.chmodSync(filePath, 0o600); } catch (_) { /* Windows */ }
  } catch (error) {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch (_) { /* no-op */ }
    throw error;
  }
}

function writeEncryptedDatabase(filePath, bytes, safeStorage) {
  ensureSafeStorage(safeStorage);
  const database = backupFormat.validateSqliteBytes(bytes);
  const encrypted = safeStorage.encryptString(JSON.stringify(Array.from(database)));
  atomicWrite(filePath, encrypted);
}

async function validateSqliteContract(bytes, kind, expectedClinicUid = null) {
  const SQL = await initSqlJs();
  const databaseBytes = backupFormat.validateSqliteBytes(bytes);
  let db;
  try {
    db = new SQL.Database(new Uint8Array(databaseBytes));
    const integrity = db.exec('PRAGMA integrity_check');
    const integrityValue = integrity?.[0]?.values?.[0]?.[0];
    if (String(integrityValue || '').toLowerCase() !== 'ok') throw new Error('PRAGMA integrity_check falhou.');

    const tableRows = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = new Set((tableRows?.[0]?.values || []).map(row => String(row[0])));
    const required = kind === 'clinic' ? CLINIC_REQUIRED_TABLES : PROFESSIONAL_REQUIRED_TABLES;
    const missing = required.filter(name => !tableNames.has(name));
    if (missing.length) throw new Error(`Banco ${kind === 'clinic' ? 'da clínica' : 'profissional'} incompatível: tabelas ausentes (${missing.join(', ')}).`);

    if (kind === 'clinic' && expectedClinicUid) {
      const rows = db.exec("SELECT valor FROM configuracoes WHERE chave='clinic_uid' LIMIT 1");
      const actual = rows?.[0]?.values?.[0]?.[0] == null ? '' : String(rows[0].values[0][0]);
      if (actual && actual !== String(expectedClinicUid)) throw new Error('Identificador da clínica no banco diverge do manifesto do backup.');
    }
    return { ok: true };
  } catch (error) {
    throw new Error(`Banco SQLite inválido para restauração: ${error.message}`);
  } finally {
    try { db?.close(); } catch (_) { /* no-op */ }
  }
}

function assertAdmin(isolationService, event, token) {
  if (!isolationService?.requireSession) throw new Error('Validação de sessão administrativa indisponível.');
  const session = isolationService.requireSession(event, token);
  if (session?.role !== 'admin') throw new Error('Apenas administradores podem gerenciar backups completos.');
  return session;
}

function assertRestoreOwner(restoreSessions, isolationService, event, token, sessionId, expectedState = null) {
  const admin = assertAdmin(isolationService, event, token);
  const id = String(sessionId || '');
  const restore = restoreSessions.get(id);
  if (!restore) throw new Error('Sessão de restauração inexistente ou expirada.');
  if (restore.senderId !== event?.sender?.id || restore.userId !== Number(admin.userId)) {
    throw new Error('Sessão de restauração não pertence a este administrador/janela.');
  }
  if (expectedState && restore.state !== expectedState) throw new Error(`Sessão de restauração não está em estado ${expectedState}.`);
  return restore;
}

function stageCompositePayload(userData, payload, safeStorage, sessionId) {
  const stageRoot = path.join(userData, '.restore-staging', sessionId);
  const stageData = path.join(stageRoot, 'data');
  safeRm(stageRoot);
  fs.mkdirSync(stageData, { recursive: true });
  try {
    writeEncryptedDatabase(path.join(stageData, 'clinic', 'clinic.db.enc'), payload.clinicDatabase, safeStorage);
    for (const professional of payload.professionals) {
      const professionalRoot = path.join(stageData, 'professionals', professional.professionalUid);
      writeEncryptedDatabase(path.join(professionalRoot, 'clinical.db.enc'), professional.database, safeStorage);
      const filesRoot = path.join(professionalRoot, 'files');
      fs.mkdirSync(filesRoot, { recursive: true });
      for (const file of professional.files) {
        const relativePath = backupFormat.normalizeRelativePath(file.relativePath);
        const target = path.resolve(filesRoot, relativePath);
        const resolvedRoot = path.resolve(filesRoot);
        if (!target.startsWith(resolvedRoot + path.sep)) throw new Error('Caminho de arquivo clínico fora do staging.');
        atomicWrite(target, file.data);
      }
    }
    return { stageRoot, stageData };
  } catch (error) {
    safeRm(stageRoot);
    throw error;
  }
}

function createCompositeBackupService({ app, safeStorage, isolationService, dialog, logger = console } = {}) {
  if (!app?.getPath || !safeStorage || !isolationService) throw new Error('Dependências do backup composto ausentes.');
  ensureSafeStorage(safeStorage);
  const restoreSessions = new Map();

  function userData() { return app.getPath('userData'); }

  async function validateCompositeDatabases(payload) {
    await validateSqliteContract(payload.clinicDatabase, 'clinic', payload.manifest.clinicUid);
    for (const professional of payload.professionals) await validateSqliteContract(professional.database, 'professional');
  }

  async function save(event, token, password) {
    assertAdmin(isolationService, event, token);
    const clinicUid = await isolationService.getClinicUid();
    if (!clinicUid) throw new Error('Identificador da clínica não encontrado.');
    const exported = inventory.exportCompositeInventory({ userData: userData(), safeStorage, clinicUid });
    await validateSqliteContract(exported.clinicDatabase, 'clinic', clinicUid);
    for (const professional of exported.professionals) await validateSqliteContract(professional.database, 'professional');
    const encrypted = backupFormat.encryptCompositeBackup(exported, password);
    const suggested = `Plennus-Clinic-Completo-${new Date().toISOString().slice(0, 10)}.plennus3`;
    const selection = await dialog?.showSaveDialog?.({
      title: 'Salvar backup completo do Plennus Clinic',
      defaultPath: suggested,
      filters: [{ name: 'Backup completo Plennus Clinic', extensions: ['plennus3'] }]
    });
    if (!selection || selection.canceled || !selection.filePath) return { ok: false, cancelado: true };
    atomicWrite(selection.filePath, encrypted, { encoding: 'utf8' });
    return {
      ok: true,
      path: selection.filePath,
      professionals: exported.professionals.length,
      files: exported.professionals.reduce((count, professional) => count + professional.files.length, 0),
      format: backupFormat.COMPOSITE_FORMAT
    };
  }

  async function open(event, token, password) {
    const admin = assertAdmin(isolationService, event, token);
    const selection = await dialog?.showOpenDialog?.({
      title: 'Selecionar backup completo do Plennus Clinic',
      properties: ['openFile'],
      filters: [{ name: 'Backups Plennus Clinic', extensions: ['plennus3', 'plennus'] }]
    });
    if (!selection || selection.canceled || !selection.filePaths?.[0]) return { ok: false, cancelado: true };
    const sourcePath = selection.filePaths[0];
    const stat = fs.statSync(sourcePath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_ENCRYPTED_BACKUP_FILE_BYTES) throw new Error('Arquivo de backup inválido ou acima do limite permitido.');
    const text = fs.readFileSync(sourcePath, 'utf8');
    let envelope;
    try { envelope = JSON.parse(text); } catch (_) { throw new Error('Formato de backup inválido.'); }
    if ([backupFormat.FORMAT, backupFormat.PORTABLE_FORMAT].includes(envelope?.format)) {
      return { ok: false, legacyFormat: true, format: envelope.format, error: 'Backup legado V1/V2 detectado.' };
    }
    const payload = backupFormat.decryptCompositeBackup(text, password);
    await validateCompositeDatabases(payload);
    const sessionId = crypto.randomBytes(24).toString('hex');
    const staged = stageCompositePayload(userData(), payload, safeStorage, sessionId);
    const restore = {
      sessionId,
      senderId: event.sender.id,
      userId: Number(admin.userId),
      state: 'staged',
      stageRoot: staged.stageRoot,
      stageData: staged.stageData,
      safetyRoot: null,
      safetyData: null,
      clinicUid: payload.manifest.clinicUid,
      createdAt: Date.now()
    };
    restoreSessions.set(sessionId, restore);
    return {
      ok: true,
      sessionId,
      clinicUid: payload.manifest.clinicUid,
      professionals: payload.professionals.length,
      files: payload.professionals.reduce((count, professional) => count + professional.files.length, 0),
      format: backupFormat.COMPOSITE_FORMAT,
      requiresReload: true
    };
  }

  async function commit(event, token, sessionId) {
    const restore = assertRestoreOwner(restoreSessions, isolationService, event, token, sessionId, 'staged');
    const base = userData();
    const activeData = path.join(base, 'data');
    if (!fs.existsSync(restore.stageData)) throw new Error('Staging da restauração não está mais disponível.');
    const safetyRoot = path.join(base, '.restore-safety', restore.sessionId);
    const safetyData = path.join(safetyRoot, 'data');
    safeRm(safetyRoot);
    fs.mkdirSync(safetyRoot, { recursive: true });
    let movedCurrent = false;
    try {
      if (fs.existsSync(activeData)) {
        fs.renameSync(activeData, safetyData);
        movedCurrent = true;
      }
      fs.renameSync(restore.stageData, activeData);
      restore.state = 'committed';
      restore.safetyRoot = safetyRoot;
      restore.safetyData = movedCurrent ? safetyData : null;
      try { fs.rmdirSync(restore.stageRoot); } catch (_) { /* parent may remain */ }
      isolationService.invalidateAllSessions?.();
      return { ok: true, sessionId: restore.sessionId, rollbackAvailable: movedCurrent, requiresReload: true };
    } catch (error) {
      try {
        if (fs.existsSync(activeData) && movedCurrent) safeRm(activeData);
        if (movedCurrent && fs.existsSync(safetyData)) fs.renameSync(safetyData, activeData);
      } catch (rollbackError) {
        logger.error?.('Falha no rollback automático do restore composto:', rollbackError);
        throw new Error(`Falha ao aplicar backup e ao restaurar snapshot anterior: ${rollbackError.message}`);
      }
      safeRm(safetyRoot);
      throw new Error(`Restauração composta cancelada sem troca ativa: ${error.message}`);
    }
  }

  async function rollback(event, token, sessionId) {
    const restore = assertRestoreOwner(restoreSessions, isolationService, event, token, sessionId, 'committed');
    if (!restore.safetyData || !fs.existsSync(restore.safetyData)) throw new Error('Snapshot anterior não está disponível para rollback.');
    const base = userData();
    const activeData = path.join(base, 'data');
    const displacedRoot = path.join(base, '.restore-discard', restore.sessionId);
    const displacedData = path.join(displacedRoot, 'data');
    safeRm(displacedRoot);
    fs.mkdirSync(displacedRoot, { recursive: true });
    let movedNew = false;
    try {
      if (fs.existsSync(activeData)) {
        fs.renameSync(activeData, displacedData);
        movedNew = true;
      }
      fs.renameSync(restore.safetyData, activeData);
      safeRm(displacedRoot);
      safeRm(restore.safetyRoot);
      safeRm(restore.stageRoot);
      restoreSessions.delete(restore.sessionId);
      isolationService.invalidateAllSessions?.();
      return { ok: true, requiresReload: true };
    } catch (error) {
      try {
        if (!fs.existsSync(activeData) && movedNew && fs.existsSync(displacedData)) fs.renameSync(displacedData, activeData);
      } catch (recoveryError) {
        logger.error?.('Falha ao recuperar dados após rollback composto:', recoveryError);
      }
      throw new Error(`Não foi possível reverter a restauração: ${error.message}`);
    }
  }

  async function cancel(event, token, sessionId) {
    const restore = assertRestoreOwner(restoreSessions, isolationService, event, token, sessionId);
    if (restore.state === 'committed') throw new Error('Restauração já aplicada; use rollback.');
    safeRm(restore.stageRoot);
    restoreSessions.delete(restore.sessionId);
    return { ok: true };
  }

  function dispose() {
    for (const restore of restoreSessions.values()) if (restore.state === 'staged') safeRm(restore.stageRoot);
    restoreSessions.clear();
  }

  return { save, open, commit, rollback, cancel, dispose, restoreSessions };
}

function installCompositeBackupService({ app, ipcMain, safeStorage, isolationService, dialog, logger = console } = {}) {
  if (!ipcMain) throw new Error('ipcMain obrigatório para backup composto.');
  const service = createCompositeBackupService({ app, safeStorage, isolationService, dialog, logger });
  const wrap = method => async (event, ...args) => {
    try { return await service[method](event, ...args); }
    catch (error) {
      logger.warn?.(`Backup composto ${method} recusado:`, error.message);
      return { ok: false, error: error.message };
    }
  };
  for (const channel of ['save', 'open', 'commit', 'rollback', 'cancel']) {
    const ipcChannel = `composite-backup:${channel}`;
    try { ipcMain.removeHandler(ipcChannel); } catch (_) { /* no-op */ }
    ipcMain.handle(ipcChannel, wrap(channel));
  }
  return service;
}

module.exports = {
  MAX_ENCRYPTED_BACKUP_FILE_BYTES,
  CLINIC_REQUIRED_TABLES,
  PROFESSIONAL_REQUIRED_TABLES,
  atomicWrite,
  writeEncryptedDatabase,
  validateSqliteContract,
  createCompositeBackupService,
  installCompositeBackupService
};
