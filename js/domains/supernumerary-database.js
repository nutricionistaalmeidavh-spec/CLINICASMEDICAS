(function (root, factory) {
  const exported = factory();
  if (typeof module === 'object' && module.exports) module.exports = exported;
  if (root) {
    root.PlennusSupernumeraryDatabase = exported;
    if (root.DB && root.PlennusSupernumeraryModel) {
      root.PlennusSupernumerary = exported.createApi({
        DB: root.DB,
        model: root.PlennusSupernumeraryModel,
        currentUser: () => typeof currentUser !== 'undefined' ? currentUser : null
      });
    }
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function randomId() {
    const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
    if (cryptoApi?.getRandomValues) {
      const bytes = new Uint8Array(16);
      cryptoApi.getRandomValues(bytes);
      return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  function createApi({ DB, model, currentUser = () => null } = {}) {
    if (!DB?.query || !DB?.run || !model) throw new Error('Dependências do módulo supranumerário ausentes.');

    function professionalId(explicit = null) {
      const id = Number(explicit || DB.session?.()?.professionalId || currentUser()?.profissional_id || 0);
      if (!Number.isInteger(id) || id <= 0) throw new Error('Sessão profissional necessária para o odontograma.');
      return id;
    }

    function userId(explicit = null) {
      const id = Number(explicit || currentUser()?.id || 0);
      return Number.isInteger(id) && id > 0 ? id : null;
    }

    function normalize(row) {
      return row ? model.normalizeElement(row) : null;
    }

    function get(id) {
      const elementId = Number(id);
      if (!Number.isInteger(elementId) || elementId <= 0) return null;
      return normalize(DB.query('SELECT * FROM odontograma_elementos WHERE id=? LIMIT 1', [elementId])[0]);
    }

    function list(odontogramId, options = {}) {
      const oid = Number(odontogramId);
      if (!Number.isInteger(oid) || oid <= 0) return [];
      const pid = professionalId(options.professionalId);
      const includeInactive = options.includeInactive === true;
      const rows = DB.query(`SELECT * FROM odontograma_elementos
        WHERE odontograma_id=? AND profissional_id=? ${includeInactive ? '' : 'AND ativo=1'}
        ORDER BY dente_referencia_fdi,indice,id`, [oid, pid]);
      return rows.map(normalize);
    }

    function create({ odontogramId, referenceTooth, professionalId: explicitProfessionalId, userId: explicitUserId } = {}) {
      const oid = Number(odontogramId);
      if (!Number.isInteger(oid) || oid <= 0) throw new Error('Odontograma inválido.');
      const pid = professionalId(explicitProfessionalId);
      const tooth = model.validateReferenceTooth(referenceTooth);
      const existing = DB.query(`SELECT dente_referencia_fdi,indice FROM odontograma_elementos
        WHERE odontograma_id=? AND profissional_id=? AND dente_referencia_fdi=?`, [oid, pid, tooth]);
      const index = model.nextIndex(existing, tooth);
      const dentition = model.dentitionForTooth(tooth);
      DB.run(`INSERT INTO odontograma_elementos
        (external_id,odontograma_id,profissional_id,elemento_tipo,dente_referencia_fdi,indice,denticao,status,ativo)
        VALUES (?,?,?,?,?,?,?,'presente',1)`, [randomId(), oid, pid, 'supranumerario', tooth, index, dentition]);
      const id = Number(DB.getLastId?.() || DB.query('SELECT last_insert_rowid() id')[0]?.id || 0);
      if (!id) throw new Error('Não foi possível identificar o supranumerário criado.');
      DB.run(`INSERT INTO odontograma_elemento_eventos
        (elemento_id,tipo,status_novo,detalhes,registrado_por) VALUES (?,'criado','presente',?,?)`,
        [id, model.makeLabel(tooth, index), userId(explicitUserId)]);
      return get(id);
    }

    function setStatus(id, status, explicitUserId = null) {
      const element = get(id);
      if (!element) throw new Error('Elemento supranumerário não encontrado.');
      const next = model.validateStatus(status);
      if (element.status === next) return element;
      DB.run("UPDATE odontograma_elementos SET status=?,atualizado_em=datetime('now','localtime') WHERE id=?", [next, element.id]);
      DB.run(`INSERT INTO odontograma_elemento_eventos
        (elemento_id,tipo,status_anterior,status_novo,detalhes,registrado_por)
        VALUES (?,'status',?,?,?,?)`, [element.id, element.status, next, element.label, userId(explicitUserId)]);
      return get(element.id);
    }

    function setActive(id, active, explicitUserId = null) {
      const element = get(id);
      if (!element) throw new Error('Elemento supranumerário não encontrado.');
      const next = active ? 1 : 0;
      if (Number(element.ativo) === next || Boolean(element.ativo) === Boolean(active)) return element;
      DB.run("UPDATE odontograma_elementos SET ativo=?,atualizado_em=datetime('now','localtime') WHERE id=?", [next, element.id]);
      DB.run(`INSERT INTO odontograma_elemento_eventos
        (elemento_id,tipo,detalhes,registrado_por) VALUES (?,'atividade',?,?)`,
        [element.id, active ? 'reativado' : 'desativado', userId(explicitUserId)]);
      return get(element.id);
    }

    function history(id) {
      const elementId = Number(id);
      if (!Number.isInteger(elementId) || elementId <= 0) return [];
      return DB.query('SELECT * FROM odontograma_elemento_eventos WHERE elemento_id=? ORDER BY id', [elementId]);
    }

    function addCondition(id, { condition, face = null, observation = null, userId: explicitUserId = null } = {}) {
      const element = get(id);
      if (!element) throw new Error('Elemento supranumerário não encontrado.');
      const normalizedCondition = String(condition || '').trim();
      if (!normalizedCondition) throw new Error('Condição odontológica obrigatória.');
      DB.run(`INSERT INTO odontograma_condicoes
        (odontograma_id,dente,face,condicao,observacao,ativo,registrado_por,elemento_dental_id)
        VALUES (?,?,?,?,?,1,?,?)`, [
        element.odontograma_id,
        element.dente_referencia_fdi,
        face || null,
        normalizedCondition,
        observation ? String(observation) : null,
        userId(explicitUserId),
        element.id
      ]);
      return DB.getLastId?.() || null;
    }

    function conditions(id) {
      const elementId = Number(id);
      if (!Number.isInteger(elementId) || elementId <= 0) return [];
      return DB.query('SELECT * FROM odontograma_condicoes WHERE elemento_dental_id=? AND ativo=1 ORDER BY id DESC', [elementId]);
    }

    function labelForElement(elementOrId) {
      const element = typeof elementOrId === 'object' ? normalize(elementOrId) : get(elementOrId);
      return element?.label || '';
    }

    function targetForElement(elementOrId) {
      const element = typeof elementOrId === 'object' ? normalize(elementOrId) : get(elementOrId);
      if (!element) return null;
      return {
        kind: 'supernumerary',
        elementId: element.id,
        referenceTooth: element.dente_referencia_fdi,
        label: element.label,
        status: element.status,
        dentition: element.denticao
      };
    }

    return { create, list, get, setStatus, setActive, history, addCondition, conditions, labelForElement, targetForElement };
  }

  return { createApi, randomId };
});
