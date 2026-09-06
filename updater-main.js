const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const { createUpdaterService } = require('./js/core/updater-service');
const { installDesktopDataHardening } = require('./js/core/desktop-data-hardening');

// Mantém o bootstrap clínico existente e aplica hardening de persistência antes da janela iniciar o renderer.
require('./main.js');
installDesktopDataHardening();

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
