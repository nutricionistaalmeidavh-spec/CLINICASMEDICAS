const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

function backupDirectory() {
  return path.join(app.getPath('userData'), 'backups');
}

function clinicalFilesDirectory() {
  return path.join(app.getPath('userData'), 'clinical-files');
}

function isAllowedSnapshot(snapshotPath) {
  if (typeof snapshotPath !== 'string' || !path.isAbsolute(snapshotPath)) return false;
  const backupRoot = path.resolve(backupDirectory()) + path.sep;
  const resolved = path.resolve(snapshotPath);
  return resolved.startsWith(backupRoot) && path.basename(resolved).startsWith('clinical-files-pre-restore-');
}

function rollbackClinicalFiles(snapshotPath, hadPrevious) {
  const target = clinicalFilesDirectory();
  if (!hadPrevious) {
    fs.rmSync(target, { recursive: true, force: true });
    return { ok: true };
  }
  if (!isAllowedSnapshot(snapshotPath) || !fs.existsSync(snapshotPath) || !fs.statSync(snapshotPath).isDirectory()) {
    throw new Error('Snapshot de anexos inválido ou indisponível.');
  }
  const swap = path.join(app.getPath('userData'), `clinical-files.rollback-${Date.now()}`);
  try {
    fs.cpSync(snapshotPath, swap, { recursive: true });
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(swap, target);
    return { ok: true };
  } catch (error) {
    try { fs.rmSync(swap, { recursive: true, force: true }); } catch (_) { /* no-op */ }
    throw error;
  }
}

function installRestoreRollback() {
  ipcMain.removeHandler('reverter-restauracao-anexos');
  ipcMain.handle('reverter-restauracao-anexos', (_event, snapshotPath, hadPrevious) => {
    try { return rollbackClinicalFiles(snapshotPath, Boolean(hadPrevious)); }
    catch (error) { return { ok: false, error: error.message }; }
  });
}

module.exports = { installRestoreRollback, rollbackClinicalFiles, isAllowedSnapshot };
