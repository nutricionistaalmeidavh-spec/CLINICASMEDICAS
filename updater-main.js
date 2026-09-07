const { app, BrowserWindow, ipcMain, safeStorage, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { createUpdaterService } = require('./js/core/updater-service');
const { installDesktopDataHardening } = require('./js/core/desktop-data-hardening');
const { installRestoreRollback } = require('./js/core/restore-rollback');
const { installLocalDataIsolation, SESSION_TTL_MS } = require('./js/core/local-data-isolation-main');
const { installProfessionalClinicalImageReader } = require('./js/core/professional-clinical-image-main');
const { installCompositeBackupService } = require('./js/core/composite-backup-service');
const { installClinicHub } = require('./js/core/clinic-network-main');

// Mantém o bootstrap clínico existente e aplica os serviços desktop antes da janela iniciar o renderer.
require('./main.js');
const isolationService = installLocalDataIsolation({ app, ipcMain, safeStorage, dialog, shell });

function requireExistingSession(event, token) {
  const key = String(token || '');
  const session = isolationService.sessions.get(key);
  if (!session) throw new Error('Sessão local expirada ou inválida.');
  if (Date.now() - Number(session.lastSeenAt || 0) > SESSION_TTL_MS) {
    isolationService.sessions.delete(key);
    throw new Error('Sessão local expirada ou inválida.');
  }
  if (session.senderId !== event.sender.id) throw new Error('Sessão local não pertence a esta janela.');
  session.lastSeenAt = Date.now();
  return session;
}

const administrativeIsolationService = {
  ...isolationService,
  requireSession: requireExistingSession,
  invalidateAllSessions: () => isolationService.sessions.clear()
};

installProfessionalClinicalImageReader({ ipcMain, isolationService, logger: console });
installCompositeBackupService({ app, ipcMain, safeStorage, isolationService: administrativeIsolationService, dialog, logger: console });
installClinicHub({ app, ipcMain, safeStorage, isolationService, BrowserWindow, logger: console });
installDesktopDataHardening();
installRestoreRollback();

let updater = null;

function getMainWindow() {
  return BrowserWindow.getAllWindows().find(window => !window.isDestroyed()) || null;
}

function fallbackState() {
  return {
    status: app.isReady() ? 'idle' : 'starting',
    currentVersion: app.getVersion(),
    availableVersion: null,
    progress: null,
    error: null,
    supported: false
  };
}

function requireUpdater() {
  if (!updater) throw new Error('Serviço de atualização ainda não está pronto.');
  return updater;
}

ipcMain.handle('updater:state', () => updater ? updater.state() : fallbackState());
ipcMain.handle('updater:check', () => requireUpdater().check());
ipcMain.handle('updater:download', () => requireUpdater().download());
ipcMain.handle('updater:install', () => requireUpdater().install());

app.whenReady().then(() => {
  updater = createUpdaterService({
    app,
    autoUpdater,
    getWindow: getMainWindow,
    logger: console,
    platform: process.platform
  });
  updater.start();
});