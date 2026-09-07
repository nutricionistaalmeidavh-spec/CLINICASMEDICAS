const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CLINICAL_EXTENSIONS = new Set(['.pdf','.png','.jpg','.jpeg','.webp','.gif','.txt','.csv','.doc','.docx','.xls','.xlsx']);
const CLINICAL_MIME_TYPES = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.txt': 'text/plain', '.csv': 'text/csv',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function sanitizeIdentity(value) {
  const safe = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) throw new Error('Identificador profissional inválido.');
  return safe.slice(0, 96);
}

function professionalFilesDirectoryForIdentity(userData, identity) {
  return path.join(String(userData || ''), 'data', 'professionals', sanitizeIdentity(identity), 'files');
}

function isPathInside(root, candidate) {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) return false;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  return resolved !== resolvedRoot && resolved.startsWith(resolvedRoot + path.sep);
}

function isManagedProfessionalClinicalPath(userData, identity, filePath) {
  try { return isPathInside(professionalFilesDirectoryForIdentity(userData, identity), filePath); }
  catch (_) { return false; }
}

function legacyClinicalFilesDirectory(userData) {
  return path.join(String(userData || ''), 'clinical-files');
}

function isLegacyManagedClinicalPath(userData, filePath) {
  return isPathInside(legacyClinicalFilesDirectory(userData), filePath);
}

function clinicalMimeType(filePath) {
  return CLINICAL_MIME_TYPES[path.extname(String(filePath || '')).toLowerCase()] || null;
}

function assertAllowedSource(sourcePath) {
  if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) throw new Error('Arquivo clínico inválido.');
  const ext = path.extname(sourcePath).toLowerCase();
  if (!CLINICAL_EXTENSIONS.has(ext) || !fs.existsSync(sourcePath)) throw new Error('Arquivo clínico inválido.');
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile()) throw new Error('Arquivo clínico inválido.');
  return ext;
}

function copyClinicalFileIntoProfessionalStorage(userData, identity, sourcePath) {
  const ext = assertAllowedSource(sourcePath);
  const dir = professionalFilesDirectoryForIdentity(userData, identity);
  fs.mkdirSync(dir, { recursive: true });
  const managedName = `${crypto.randomUUID()}${ext}`;
  const target = path.join(dir, managedName);
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.copyFileSync(sourcePath, temp);
    try { fs.chmodSync(temp, 0o600); } catch (_) { /* Windows */ }
    fs.renameSync(temp, target);
    return {
      path: target,
      name: path.basename(sourcePath),
      managedName,
      mimeType: clinicalMimeType(sourcePath)
    };
  } catch (error) {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch (_) { /* no-op */ }
    throw error;
  }
}

function adoptLegacyClinicalFile(userData, identity, legacyPath) {
  if (!isLegacyManagedClinicalPath(userData, legacyPath)) throw new Error('Arquivo legado não pertence ao armazenamento clínico gerenciado.');
  return copyClinicalFileIntoProfessionalStorage(userData, identity, legacyPath);
}

function removeProfessionalClinicalFile(userData, identity, filePath) {
  if (!isManagedProfessionalClinicalPath(userData, identity, filePath)) throw new Error('Arquivo não pertence ao profissional autenticado.');
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return { ok: true };
}

function listProfessionalClinicalFiles(userData, identity) {
  const root = professionalFilesDirectoryForIdentity(userData, identity);
  if (!fs.existsSync(root)) return [];
  const files = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.isFile()) continue;
      const relativePath = path.relative(root, full).replace(/\\/g, '/');
      if (!relativePath || relativePath.includes('..')) continue;
      const data = fs.readFileSync(full);
      files.push({
        relativePath,
        name: entry.name,
        mimeType: clinicalMimeType(full),
        sha256: crypto.createHash('sha256').update(data).digest('hex'),
        data
      });
    }
  };
  walk(root);
  return files;
}

module.exports = {
  CLINICAL_EXTENSIONS,
  professionalFilesDirectoryForIdentity,
  isManagedProfessionalClinicalPath,
  legacyClinicalFilesDirectory,
  isLegacyManagedClinicalPath,
  clinicalMimeType,
  copyClinicalFileIntoProfessionalStorage,
  adoptLegacyClinicalFile,
  removeProfessionalClinicalFile,
  listProfessionalClinicalFiles
};
