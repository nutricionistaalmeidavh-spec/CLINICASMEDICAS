(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlennusAudit = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SECRET_KEY_PATTERN = /(senha|password|hash|base64|binario|binary|token|secret)/i;

  function sanitizePayload(value, depth = 0) {
    if (depth > 4) return '[truncated]';
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.length > 1200 ? `${value.slice(0, 1200)}…` : value;
    if (Array.isArray(value)) return value.slice(0, 50).map(item => sanitizePayload(item, depth + 1));
    if (typeof value === 'object') {
      const clean = {};
      Object.entries(value).slice(0, 100).forEach(([key, item]) => {
        if (SECRET_KEY_PATTERN.test(key)) return;
        clean[key] = sanitizePayload(item, depth + 1);
      });
      return clean;
    }
    return String(value);
  }

  function actorFromUser(user, mode) {
    if (mode === 'migration') return { id: null, nome: 'system', nivel: 'migration' };
    return {
      id: user?.id ?? null,
      nome: user?.nome || 'system',
      nivel: user?.nivel || 'system'
    };
  }

  function compactJson(value) {
    if (value == null) return null;
    const text = JSON.stringify(sanitizePayload(value));
    return text.length > 8000 ? `${text.slice(0, 7990)}…` : text;
  }

  function log(event = {}, options = {}) {
    if (typeof DB === 'undefined' || !DB?.run) {
      if (options.strict) throw new Error('Audit database unavailable');
      return false;
    }
    try {
      const user = options.user !== undefined
        ? options.user
        : (typeof currentUser !== 'undefined' ? currentUser : null);
      const actor = actorFromUser(user, options.mode);
      DB.run(
        `INSERT INTO audit_log
          (usuario_id,usuario_nome,usuario_nivel,acao,entidade,entidade_id,campos_alterados,contexto)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          actor.id,
          actor.nome,
          actor.nivel,
          String(event.acao || 'evento'),
          String(event.entidade || 'sistema'),
          event.entidadeId ?? null,
          compactJson(event.camposAlterados),
          compactJson(event.contexto)
        ]
      );
      return true;
    } catch (error) {
      console.error('Falha ao registrar auditoria:', error);
      if (options.strict) throw error;
      return false;
    }
  }

  function systemMigrationEvent(version, name) {
    return {
      acao: 'migration_aplicada',
      entidade: 'schema',
      entidadeId: version,
      contexto: { version, name }
    };
  }

  return { sanitizePayload, actorFromUser, compactJson, log, systemMigrationEvent };
});
