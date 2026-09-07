(function (root, factory) {
  const api = factory(root?.PlennusOdontologyModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlennusSupernumeraryModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function (odontologyModel) {
  const STATUSES = Object.freeze(['presente', 'ausente', 'extraido']);

  function isValidFdiTooth(value) {
    if (odontologyModel?.isValidFdiTooth) return odontologyModel.isValidFdiTooth(value);
    const tooth = Number(value);
    if (!Number.isInteger(tooth)) return false;
    const quadrant = Math.floor(tooth / 10);
    const position = tooth % 10;
    if ([1, 2, 3, 4].includes(quadrant)) return position >= 1 && position <= 8;
    if ([5, 6, 7, 8].includes(quadrant)) return position >= 1 && position <= 5;
    return false;
  }

  function validateReferenceTooth(value) {
    const tooth = Number(value);
    if (!isValidFdiTooth(tooth)) throw new Error('Dente de referência FDI inválido.');
    return tooth;
  }

  function validateIndex(value) {
    const index = Number(value);
    if (!Number.isInteger(index) || index <= 0) throw new Error('Índice supranumerário inválido.');
    return index;
  }

  function validateStatus(value) {
    const status = String(value || '').trim().toLowerCase();
    if (!STATUSES.includes(status)) throw new Error('Status supranumerário inválido.');
    return status;
  }

  function dentitionForTooth(value) {
    const tooth = validateReferenceTooth(value);
    return tooth >= 50 ? 'decidua' : 'permanente';
  }

  function makeLabel(referenceTooth, index) {
    return `${validateReferenceTooth(referenceTooth)}-SN${validateIndex(index)}`;
  }

  function nextIndex(elements = [], referenceTooth) {
    const tooth = validateReferenceTooth(referenceTooth);
    const max = (Array.isArray(elements) ? elements : [])
      .filter(row => Number(row?.dente_referencia_fdi) === tooth)
      .reduce((highest, row) => Math.max(highest, Number(row?.indice) || 0), 0);
    return max + 1;
  }

  function normalizeElement(row) {
    if (!row) return null;
    const referenceTooth = validateReferenceTooth(row.dente_referencia_fdi);
    const index = validateIndex(row.indice);
    return {
      ...row,
      id: Number(row.id),
      odontograma_id: Number(row.odontograma_id),
      profissional_id: Number(row.profissional_id),
      dente_referencia_fdi: referenceTooth,
      indice: index,
      denticao: row.denticao || dentitionForTooth(referenceTooth),
      status: validateStatus(row.status || 'presente'),
      ativo: Number(row.ativo) !== 0,
      label: makeLabel(referenceTooth, index)
    };
  }

  return {
    STATUSES,
    isValidFdiTooth,
    validateReferenceTooth,
    validateIndex,
    validateStatus,
    dentitionForTooth,
    makeLabel,
    nextIndex,
    normalizeElement
  };
});
