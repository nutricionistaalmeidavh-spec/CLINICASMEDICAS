const { app, ipcMain, dialog, safeStorage, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const backupFormat = require('./backup-format');

const DB_FILENAME = 'plennus-clinic.db.enc';
const CLINICAL_EXTENSIONS = new Set(['.pdf','.png','.jpg','.jpeg','.webp','.gif','.txt','.csv','.doc','.docx','.xls','.xlsx']);
const CLINICAL_MIME_TYPES = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.txt': 'text/plain', '.csv': 'text/csv',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function databasePath() {
  return path.join(app.getPath('userData'), DB_FILENAME);
}

function backupDirectory() {
  return path.join(app.getPath('userData'), 'backups');
}

function clinicalFilesDirectory() {
  return path.join(app.getPath('userData'), 'clinical-files');
}

function restoreStagingDirectory() {
  return path.join(app.getPath('userData'), 'restore-staging');
}

function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeSnapshot(source, prefix) {
  if (!fs.existsSync(source)) return null;
  const dir = ensureDirectory(backupDirectory());
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `${prefix}-${stamp}`);
  const stat = fs.statSync(source);
  if (stat.isDirectory()) fs.cpSync(source, target, { recursive: true });
  else fs.copyFileSync(source, target);
  return target;
}

function replaceHandler(channel, handler) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, handler);
}

function clinicalMimeType(filePath) {
  return CLINICAL_MIME_TYPES[path.extname(filePath).toLowerCase()] || null;
}

function isManagedClinicalPath(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) return false;
  const root = path.resolve(clinicalFilesDirectory()) + path.sep;
  return path.resolve(filePath).startsWith(root);
}

function isAllowedClinicalPath(filePath) {
  return typeof filePath === 'string'
    && path.isAbsolute(filePath)
    && CLINICAL_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function copyClinicalFileIntoManagedStorage(sourcePath) {
  if (!isAllowedClinicalPath(sourcePath) || !fs.existsSync(sourcePath)) throw new Error('Arquivo clínico inválido.');
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile()) throw new Error('Arquivo clínico inválido.');
  const dir = ensureDirectory(clinicalFilesDirectory());
  const ext = path.extname(sourcePath).toLowerCase();
  const managedName = `${crypto.randomUUID()}${ext}`;
  const target = path.join(dir, managedName);
  fs.copyFileSync(sourcePath, target);
  return { path: target, name: path.basename(sourcePath), managedName, mimeType: clinicalMimeType(sourcePath) };
}

function listManagedClinicalFiles() {
  const dir = clinicalFilesDirectory();
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const walk = current => {
    fs.readdirSync(current, { withFileTypes: true }).forEach(entry => {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (!entry.isFile()) return;
      const relativePath = path.relative(dir, full).replace(/\\/g, '/');
      if (!relativePath || relativePath.includes('..')) return;
      files.push({ relativePath, name: entry.name, mimeType: clinicalMimeType(full), data: fs.readFileSync(full) });
    });
  };
  walk(dir);
  return files;
}

function validRestoreSessionId(value) {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
}

function restoreSessionPath(sessionId) {
  if (!validRestoreSessionId(sessionId)) throw new Error('Sessão de restauração inválida.');
  return path.join(restoreStagingDirectory(), sessionId);
}

function stageManagedClinicalFiles(files) {
  const sessionId = crypto.randomUUID();
  const sessionRoot = restoreSessionPath(sessionId);
  const filesRoot = path.join(sessionRoot, 'clinical-files');
  ensureDirectory(filesRoot);
  for (const file of files || []) {
    const relativePath = String(file.relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!relativePath || relativePath.includes('..')) throw new Error('Backup contém caminho de anexo inválido.');
    const target = path.resolve(filesRoot, relativePath);
    if (!target.startsWith(path.resolve(filesRoot) + path.sep)) throw new Error('Backup contém caminho de anexo inválido.');
    ensureDirectory(path.dirname(target));
    fs.writeFileSync(target, Buffer.from(file.data), { mode: 0o600 });
  }
  fs.writeFileSync(path.join(sessionRoot, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), files: (files || []).length }), { mode: 0o600 });
  return sessionId;
}

function cancelStagedClinicalFiles(sessionId) {
  const sessionRoot = restoreSessionPath(sessionId);
  fs.rmSync(sessionRoot, { recursive: true, force: true });
  return { ok: true };
}

function commitStagedClinicalFiles(sessionId) {
  const sessionRoot = restoreSessionPath(sessionId);
  const source = path.join(sessionRoot, 'clinical-files');
  if (!fs.existsSync(source)) throw new Error('Sessão de restauração expirada ou inexistente.');
  const target = clinicalFilesDirectory();
  const safety = fs.existsSync(target) ? safeSnapshot(target, 'clinical-files-pre-restore') : null;
  const swap = path.join(app.getPath('userData'), `clinical-files.restore-${crypto.randomUUID()}`);
  try {
    fs.cpSync(source, swap, { recursive: true });
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(swap, target);
    fs.rmSync(sessionRoot, { recursive: true, force: true });
    return { ok: true, safetyBackup: safety };
  } catch (error) {
    try { fs.rmSync(swap, { recursive: true, force: true }); } catch (_) { /* no-op */ }
    if (safety && fs.existsSync(safety)) {
      try {
        fs.rmSync(target, { recursive: true, force: true });
        fs.cpSync(safety, target, { recursive: true });
      } catch (restoreError) {
        console.error('Falha ao restaurar snapshot de anexos:', restoreError);
      }
    }
    throw error;
  }
}

function pruneRestoreStaging(maxAgeMs = 24 * 60 * 60 * 1000) {
  const dir = restoreStagingDirectory();
  if (!fs.existsSync(dir)) return;
  const now = Date.now();
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    if (!entry.isDirectory() || !validRestoreSessionId(entry.name)) return;
    const full = path.join(dir, entry.name);
    try {
      if (now - fs.statSync(full).mtimeMs > maxAgeMs) fs.rmSync(full, { recursive: true, force: true });
    } catch (_) { /* no-op */ }
  });
}

function installDesktopDataHardening() {
  pruneRestoreStaging();

  replaceHandler('carregar-banco', () => {
    const filePath = databasePath();
    if (!fs.existsSync(filePath)) return null;
    try {
      safeSnapshot(filePath, 'pre-open.db.enc');
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia do sistema operacional indisponível.');
      const decrypted = safeStorage.decryptString(fs.readFileSync(filePath));
      const parsed = JSON.parse(decrypted);
      if (!Array.isArray(parsed) || !parsed.length) throw new Error('Banco local descriptografado é inválido.');
      return parsed;
    } catch (error) {
      console.error('Banco existente não pôde ser aberto; o arquivo original foi preservado:', error);
      throw new Error('Não foi possível abrir o banco existente. Nenhum banco novo foi criado ou gravado sobre ele. Restaure um backup ou verifique a criptografia do sistema.');
    }
  });

  replaceHandler('salvar-banco', (_event, data) => {
    if (!Array.isArray(data) || data.length <= 0 || data.length > backupFormat.MAX_BACKUP_BYTES || !safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'Dados do banco inválidos.' };
    }
    const target = databasePath();
    const temp = `${target}.tmp`;
    try {
      const encrypted = safeStorage.encryptString(JSON.stringify(data));
      fs.writeFileSync(temp, encrypted, { mode: 0o600 });
      fs.renameSync(temp, target);
      return { ok: true };
    } catch (error) {
      try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch (_) { /* no-op */ }
      console.error('Não foi possível salvar o banco local atomicamente:', error);
      return { ok: false, error: error.message };
    }
  });

  replaceHandler('selecionar-arquivo-clinico', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Selecionar arquivo clínico',
      properties: ['openFile'],
      filters: [{ name: 'Documentos e imagens clínicas', extensions: Array.from(CLINICAL_EXTENSIONS).map(ext => ext.slice(1)) }]
    });
    if (canceled || !filePaths?.[0]) return { ok: false, cancelado: true };
    try {
      const managed = copyClinicalFileIntoManagedStorage(filePaths[0]);
      return { ok: true, path: managed.path, name: managed.name, mimeType: managed.mimeType, managed: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  replaceHandler('abrir-arquivo-clinico', async (_event, filePath) => {
    if ((!isManagedClinicalPath(filePath) && !isAllowedClinicalPath(filePath)) || !fs.existsSync(filePath)) return { ok: false };
    try {
      const error = await shell.openPath(filePath);
      return error ? { ok: false, error } : { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  replaceHandler('salvar-backup', async (_event, data, password) => {
    try {
      const encrypted = backupFormat.encryptPortableBackup(data, listManagedClinicalFiles(), password);
      const { filePath } = await dialog.showSaveDialog({
        title: 'Salvar Backup Portátil Criptografado',
        defaultPath: `backup_plennus_${new Date().toISOString().slice(0,10)}.plennusbkp`,
        filters: [{ name: 'Backup Plennus criptografado', extensions: ['plennusbkp'] }]
      });
      if (!filePath) return { ok: false, cancelado: true };
      fs.writeFileSync(filePath, encrypted, { encoding: 'utf8', mode: 0o600 });
      return { ok: true, path: filePath, incluiAnexos: true };
    } catch (error) {
      console.error('Falha ao gerar backup portátil:', error);
      return { ok: false, error: error.message };
    }
  });

  replaceHandler('abrir-backup', async (_event, password) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Restaurar Backup',
      filters: [
        { name: 'Backup Plennus', extensions: ['plennusbkp'] },
        { name: 'Backup legado SQLite', extensions: ['db'] }
      ],
      properties: ['openFile']
    });
    if (canceled || !filePaths?.[0]) return { ok: false, cancelado: true };
    const filePath = filePaths[0];
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > backupFormat.MAX_PORTABLE_BACKUP_BYTES * 2) {
        return { ok: false, error: 'Arquivo de backup inválido ou muito grande.' };
      }
      let databaseBytes;
      let legacy = false;
      let attachmentRestoreSession = null;
      if (path.extname(filePath).toLowerCase() === '.db') {
        databaseBytes = backupFormat.validateSqliteBytes(fs.readFileSync(filePath));
        legacy = true;
      } else {
        const restored = backupFormat.decryptPortableBackup(fs.readFileSync(filePath, 'utf8'), password);
        databaseBytes = restored.databaseBytes;
        legacy = restored.legacy;
        if (!legacy) attachmentRestoreSession = stageManagedClinicalFiles(restored.files);
      }
      const dbSafety = safeSnapshot(databasePath(), 'pre-restore.db.enc');
      return {
        ok: true,
        data: Array.from(databaseBytes),
        legacy,
        portable: !legacy,
        safetyBackup: dbSafety,
        attachmentRestoreSession
      };
    } catch (error) {
      console.error('Falha ao abrir backup:', error);
      return { ok: false, error: error.message };
    }
  });

  replaceHandler('confirmar-restauracao-anexos', (_event, sessionId) => {
    try { return commitStagedClinicalFiles(sessionId); }
    catch (error) { return { ok: false, error: error.message }; }
  });

  replaceHandler('cancelar-restauracao-anexos', (_event, sessionId) => {
    try { return cancelStagedClinicalFiles(sessionId); }
    catch (error) { return { ok: false, error: error.message }; }
  });
}

module.exports = {
  installDesktopDataHardening,
  copyClinicalFileIntoManagedStorage,
  listManagedClinicalFiles,
  stageManagedClinicalFiles,
  commitStagedClinicalFiles,
  cancelStagedClinicalFiles,
  isManagedClinicalPath
};
