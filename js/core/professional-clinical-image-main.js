const fs = require('node:fs');
const path = require('node:path');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function isPathInside(root, candidate) {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) return false;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  return resolved !== resolvedRoot && resolved.startsWith(resolvedRoot + path.sep);
}

function installProfessionalClinicalImageReader({ ipcMain, isolationService, logger = console } = {}) {
  if (!ipcMain || !isolationService?.requireProfessionalSession || !isolationService?.professionalFilesDirectory) {
    throw new Error('Dependências do leitor de imagem clínica ausentes.');
  }

  ipcMain.removeHandler('data-isolation:read-clinical-image');
  ipcMain.handle('data-isolation:read-clinical-image', async (event, token, filePath) => {
    try {
      const session = isolationService.requireProfessionalSession(event, token);
      const root = isolationService.professionalFilesDirectory(session);
      if (!isPathInside(root, filePath) || !fs.existsSync(filePath)) throw new Error('Imagem não pertence ao profissional autenticado.');
      const ext = path.extname(filePath).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) throw new Error('Formato de imagem clínica não permitido.');
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_IMAGE_BYTES) throw new Error('Imagem clínica inválida ou acima do limite permitido.');
      const data = fs.readFileSync(filePath).toString('base64');
      return { ok: true, name: path.basename(filePath), dataUrl: `data:${MIME_TYPES[ext]};base64,${data}` };
    } catch (error) {
      logger.warn?.('Leitura de imagem clínica recusada:', error.message);
      return { ok: false, error: error.message };
    }
  });
}

module.exports = {
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  isPathInside,
  installProfessionalClinicalImageReader
};