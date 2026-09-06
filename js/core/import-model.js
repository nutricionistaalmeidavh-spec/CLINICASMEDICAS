(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlennusImportModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const HEADER_ALIASES = {
    nome: ['nome', 'nome completo', 'paciente'],
    cpf: ['cpf', 'documento'],
    data_nascimento: ['nascimento', 'data nascimento', 'data_nascimento', 'data de nascimento'],
    celular: ['celular', 'whatsapp', 'telefone celular'],
    telefone: ['telefone', 'fone'],
    email: ['email', 'e-mail'],
    sexo: ['sexo'],
    cidade: ['cidade'],
    uf: ['uf', 'estado'],
    observacoes: ['observacoes', 'observações', 'obs']
  };

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  function normalizeCpf(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function normalizeHeader(header) {
    const normalized = normalizeText(header).replace(/[_-]+/g, ' ');
    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some(alias => normalizeText(alias).replace(/[_-]+/g, ' ') === normalized)) return canonical;
    }
    return null;
  }

  function mapPatientRow(row = {}) {
    const mapped = {};
    Object.entries(row).forEach(([header, value]) => {
      const key = normalizeHeader(header);
      if (!key) return;
      mapped[key] = typeof value === 'string' ? value.trim() : value;
    });
    if (mapped.cpf) mapped.cpf = normalizeCpf(mapped.cpf);
    return mapped;
  }

  function validDate(value) {
    if (!value) return true;
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(value))) return false;
    const [d, m, y] = String(value).split('/').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }

  function validatePatientRow(patient) {
    const errors = [];
    if (!String(patient?.nome || '').trim()) errors.push('nome_obrigatorio');
    if (patient?.data_nascimento && !validDate(patient.data_nascimento)) errors.push('data_nascimento_invalida');
    if (patient?.cpf && normalizeCpf(patient.cpf).length !== 11) errors.push('cpf_invalido');
    return { valid: errors.length === 0, errors };
  }

  function detectDuplicate(patient, existing = []) {
    const cpf = normalizeCpf(patient?.cpf);
    if (cpf) {
      const byCpf = existing.find(item => normalizeCpf(item.cpf) === cpf);
      if (byCpf) return { duplicate: true, reason: 'cpf', existing: byCpf };
    }
    const name = normalizeText(patient?.nome);
    const birth = String(patient?.data_nascimento || '').trim();
    if (name && birth) {
      const byIdentity = existing.find(item => normalizeText(item.nome) === name && String(item.data_nascimento || '').trim() === birth);
      if (byIdentity) return { duplicate: true, reason: 'nome_nascimento', existing: byIdentity };
    }
    return { duplicate: false, reason: null, existing: null };
  }

  function buildImportPreview(rows = [], existing = []) {
    const result = { valid: [], duplicates: [], invalid: [], total: rows.length };
    rows.forEach((raw, index) => {
      const patient = mapPatientRow(raw);
      const validation = validatePatientRow(patient);
      const item = { index, patient, raw };
      if (!validation.valid) {
        result.invalid.push({ ...item, errors: validation.errors });
        return;
      }
      const duplicate = detectDuplicate(patient, existing);
      if (duplicate.duplicate) {
        result.duplicates.push({ ...item, duplicate });
        return;
      }
      result.valid.push(item);
    });
    return result;
  }

  function parseCsv(text) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    const lines = source.split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) return [];
    const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
    function parseLine(line) {
      const cells = [];
      let cell = '';
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') {
          if (quoted && line[i + 1] === '"') { cell += '"'; i += 1; }
          else quoted = !quoted;
        } else if (char === delimiter && !quoted) {
          cells.push(cell); cell = '';
        } else cell += char;
      }
      cells.push(cell);
      return cells;
    }
    const headers = parseLine(lines[0]);
    return lines.slice(1).map(line => {
      const cells = parseLine(line);
      return Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? '']));
    });
  }

  return {
    HEADER_ALIASES,
    normalizeText,
    normalizeCpf,
    normalizeHeader,
    mapPatientRow,
    validatePatientRow,
    detectDuplicate,
    buildImportPreview,
    parseCsv
  };
});
