(function (root) {
  function esc(value) {
    return typeof root.escapeHTML === 'function' ? root.escapeHTML(value) : String(value ?? '');
  }

  function isAdmin() {
    const role = typeof currentUser !== 'undefined' ? currentUser?.nivel : null;
    return root.PlennusAccessControl?.canViewAudit ? root.PlennusAccessControl.canViewAudit(role) : role === 'admin';
  }

  function ensureAuditUi() {
    const menu = document.getElementById('sidebar-menu');
    if (menu && !menu.querySelector('[data-page="auditoria"]')) {
      const item = document.createElement('div');
      item.className = 'menu-item';
      item.dataset.page = 'auditoria';
      item.dataset.roles = 'admin';
      item.textContent = '◷  Auditoria';
      item.addEventListener('click', () => root.navegar('auditoria'));
      menu.appendChild(item);
    }
    const main = document.querySelector('.main-content');
    if (main && !document.getElementById('page-auditoria')) {
      const page = document.createElement('div');
      page.id = 'page-auditoria';
      page.className = 'page';
      page.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:18px">
          <div><h1 class="page-title" style="margin-bottom:4px">Auditoria</h1><p class="text-muted">Rastreabilidade local das alterações relevantes do sistema.</p></div>
          <button class="btn btn-secondary btn-sm" id="audit-refresh">Atualizar</button>
        </div>
        <div class="card">
          <div class="form-row">
            <div class="form-group"><label>Entidade</label><select id="audit-entity"><option value="">Todas</option></select></div>
            <div class="form-group"><label>Ação</label><select id="audit-action"><option value="">Todas</option><option value="criar">Criar</option><option value="atualizar">Atualizar</option><option value="excluir">Excluir</option><option value="migration_aplicada">Migration</option><option value="importacao_pacientes">Importação</option></select></div>
          </div>
        </div>
        <div class="card"><div class="table-wrapper"><table><thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>ID</th><th>Resumo</th></tr></thead><tbody id="audit-table-body"></tbody></table></div></div>`;
      main.appendChild(page);
      page.querySelector('#audit-refresh').addEventListener('click', carregarAuditoria);
      page.querySelector('#audit-entity').addEventListener('change', renderAuditRows);
      page.querySelector('#audit-action').addEventListener('change', renderAuditRows);
    }
  }

  function listAuditRows(limit = 250) {
    if (!isAdmin()) return [];
    return root.DB.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', [Math.min(Number(limit) || 250, 500)]);
  }

  function compactSummary(row) {
    if (row.campos_alterados) {
      try {
        const parsed = JSON.parse(row.campos_alterados);
        if (Array.isArray(parsed.campos)) return parsed.campos.join(', ');
      } catch (_) { return row.campos_alterados.slice(0, 90); }
    }
    if (row.contexto) return String(row.contexto).slice(0, 90);
    return '—';
  }

  function renderAuditRows() {
    const body = document.getElementById('audit-table-body');
    if (!body) return;
    if (!isAdmin()) {
      body.innerHTML = '<tr><td colspan="6" class="text-muted">Acesso restrito ao administrador.</td></tr>';
      return;
    }
    const entity = document.getElementById('audit-entity')?.value || '';
    const action = document.getElementById('audit-action')?.value || '';
    const rows = listAuditRows().filter(row => (!entity || row.entidade === entity) && (!action || row.acao === action));
    body.innerHTML = rows.length ? rows.map(row => `<tr><td>${esc(row.criado_em)}</td><td>${esc(row.usuario_nome || 'system')}<div class="text-muted">${esc(row.usuario_nivel || '')}</div></td><td>${esc(row.acao)}</td><td>${esc(row.entidade)}</td><td>${row.entidade_id ?? '—'}</td><td>${esc(compactSummary(row))}</td></tr>`).join('') : '<tr><td colspan="6" class="text-muted">Nenhum evento encontrado.</td></tr>';
  }

  function carregarAuditoria() {
    ensureAuditUi();
    if (!isAdmin()) return;
    const select = document.getElementById('audit-entity');
    const current = select?.value || '';
    if (select) {
      const entities = root.DB.query('SELECT DISTINCT entidade FROM audit_log ORDER BY entidade').map(row => row.entidade).filter(Boolean);
      select.innerHTML = '<option value="">Todas</option>' + entities.map(entity => `<option value="${esc(entity)}">${esc(entity)}</option>`).join('');
      select.value = current;
    }
    renderAuditRows();
  }

  root.PlennusAuditView = { ensureAuditUi, listAuditRows, renderAuditRows, carregarAuditoria };
  root.carregarAuditoria = carregarAuditoria;
})(typeof window !== 'undefined' ? window : globalThis);
