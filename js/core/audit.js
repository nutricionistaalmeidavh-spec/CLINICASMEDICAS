(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlennusAudit = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SECRET_KEY_PATTERN = /(senha|password|hash|base64|binario|binary|token|secret)/i;
  const AUDITED_TABLES = new Set([
    'pacientes', 'prontuario_atendimentos', 'exames_laboratoriais', 'exames_resultados',
    'consentimentos', 'arquivos_clinicos', 'pendencias_clinicas', 'documentos_emitidos', 'import_history',
    'financeiro_categorias', 'financeiro_lancamentos', 'financeiro_caixa_links', 'financeiro_repasse_links',
    'estoque_itens', 'estoque_movimentos', 'procedimento_estoque',
    'crm_pacientes', 'crm_interacoes', 'crm_oportunidades', 'mensagens_whatsapp'
  ]);
  let dbAuditInstalled = false;

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
    return { id: user?.id ?? null, nome: user?.nome || 'system', nivel: user?.nivel || 'system' };
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
      const user = options.user !== undefined ? options.user : (typeof currentUser !== 'undefined' ? currentUser : null);
      const actor = actorFromUser(user, options.mode);
      DB.run(
        `INSERT INTO audit_log
          (usuario_id,usuario_nome,usuario_nivel,acao,entidade,entidade_id,campos_alterados,contexto)
         VALUES (?,?,?,?,?,?,?,?)`,
        [actor.id, actor.nome, actor.nivel, String(event.acao || 'evento'), String(event.entidade || 'sistema'),
          event.entidadeId ?? null, compactJson(event.camposAlterados), compactJson(event.contexto)]
      );
      return true;
    } catch (error) {
      console.error('Falha ao registrar auditoria:', error);
      if (options.strict) throw error;
      return false;
    }
  }

  function systemMigrationEvent(version, name) {
    return { acao: 'migration_aplicada', entidade: 'schema', entidadeId: version, contexto: { version, name } };
  }

  function parseWrite(sql, params) {
    const text = String(sql || '').trim();
    let match = text.match(/^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+([a-z_]+)/i);
    if (match) return { action: 'criar', table: match[1].toLowerCase(), entityId: null, fields: null };
    match = text.match(/^UPDATE\s+([a-z_]+)\s+SET\s+([\s\S]+?)\s+WHERE\s+/i);
    if (match) {
      const fields = match[2].split(',').map(part => part.split('=')[0].trim()).filter(Boolean);
      return { action: 'atualizar', table: match[1].toLowerCase(), entityId: /\bid\s*=\s*\?/i.test(text) ? params?.at?.(-1) : null, fields };
    }
    match = text.match(/^DELETE\s+FROM\s+([a-z_]+)/i);
    if (match) return { action: 'excluir', table: match[1].toLowerCase(), entityId: /\bid\s*=\s*\?/i.test(text) ? params?.at?.(-1) : null, fields: null };
    return null;
  }

  function installDbAudit(dbApi) {
    if (dbAuditInstalled || !dbApi?.run) return false;
    const originalRun = dbApi.run.bind(dbApi);
    dbApi.run = function auditedRun(sql, params = []) {
      const write = parseWrite(sql, params);
      const result = originalRun(sql, params);
      if (write && AUDITED_TABLES.has(write.table)) {
        let entityId = write.entityId;
        if (write.action === 'criar' && typeof dbApi.getLastId === 'function') entityId = dbApi.getLastId();
        log({
          acao: write.action,
          entidade: write.table,
          entidadeId: entityId,
          camposAlterados: write.fields ? { campos: write.fields } : null
        });
      }
      return result;
    };
    dbAuditInstalled = true;
    return true;
  }

  return { AUDITED_TABLES, sanitizePayload, actorFromUser, compactJson, log, systemMigrationEvent, parseWrite, installDbAudit };
});
