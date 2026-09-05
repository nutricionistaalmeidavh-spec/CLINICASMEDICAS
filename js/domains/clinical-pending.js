(function (root) {
  function esc(value) {
    return typeof root.escapeHTML === 'function' ? root.escapeHTML(value) : String(value ?? '');
  }

  function parseAppointmentDate(value) {
    if (!value) return null;
    const text = String(value).trim();
    const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function getFutureAppointments(patientId, referenceDate = new Date()) {
    const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
    return root.DB.query('SELECT * FROM agenda WHERE paciente_id=? ORDER BY id DESC', [patientId]).filter(item => {
      const status = String(item.status || '').toLowerCase();
      if (['cancelado', 'finalizado', 'faltou'].includes(status)) return false;
      const date = parseAppointmentDate(item.data);
      return date && date.getTime() >= today.getTime();
    });
  }

  function listManualPending(patientId) {
    return root.DB.query('SELECT * FROM pendencias_clinicas WHERE paciente_id=? ORDER BY id DESC', [patientId]);
  }

  function buildPatientPending(patientId) {
    const labs = root.DB.query("SELECT * FROM exames_laboratoriais WHERE paciente_id=? AND status_revisao='pendente' ORDER BY id DESC", [patientId]);
    const encounters = root.DB.query('SELECT id, paciente_id, finalizado, data_hora FROM prontuario_atendimentos WHERE paciente_id=? AND finalizado=1 ORDER BY data_hora DESC, id DESC LIMIT 1', [patientId]);
    const futureAppointments = getFutureAppointments(patientId);
    const manualItems = listManualPending(patientId);
    return root.PlennusClinicalModel.derivePendingItems({ labs, encounters, futureAppointments, manualItems });
  }

  function saveManualPending(patientId, input) {
    const title = String(input?.titulo || '').trim();
    if (!title) return { ok: false, error: 'titulo' };
    root.DB.run(`INSERT INTO pendencias_clinicas
      (paciente_id, tipo, titulo, descricao, status, vencimento_em)
      VALUES (?,?,?,?,?,?)`, [
      Number(patientId),
      String(input?.tipo || 'manual').trim() || 'manual',
      title,
      String(input?.descricao || '').trim() || null,
      'aberta',
      String(input?.vencimento_em || '').trim() || null
    ]);
    return { ok: true, id: root.DB.getLastId() };
  }

  function resolveManualPending(id) {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    root.DB.run("UPDATE pendencias_clinicas SET status='resolvida', resolvido_em=? WHERE id=?", [now, id]);
    return { ok: true };
  }

  function openPendingTarget(item, patientId) {
    if (item.type === 'lab_review') {
      root.setPatientWorkspaceTab?.('exames');
      return;
    }
    if (item.type === 'followup' && typeof root.navegar === 'function') {
      root.navegar('agenda');
      const select = document.getElementById('ag-paciente');
      if (select) select.value = String(patientId);
    }
  }

  function renderItem(item, patientId) {
    const isResolved = item.status === 'resolvida' || item.status === 'resolvido';
    return `<div class="card" style="margin:8px 0;background:#FAFAFA;display:flex;justify-content:space-between;gap:12px;align-items:center;">
      <div>
        <div><strong>${esc(item.title)}</strong> <span class="text-muted">${item.kind === 'manual' ? 'Manual' : 'Automática'}</span></div>
        ${item.description ? `<div style="margin-top:4px;">${esc(item.description)}</div>` : ''}
        <div class="text-muted">${esc(item.date || '')}${isResolved ? ' · Resolvida' : ''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
        ${item.kind === 'derived' ? `<button class="btn btn-info btn-sm" data-pending-target="${esc(item.key)}">Abrir origem</button>` : ''}
        ${item.kind === 'manual' && !isResolved ? `<button class="btn btn-success btn-sm" data-resolve-pending="${item.sourceId}">Resolver</button>` : ''}
      </div>
    </div>`;
  }

  function renderClinicalPending(patientId, container) {
    const items = buildPatientPending(patientId);
    const open = items.filter(item => item.status !== 'resolvida' && item.status !== 'resolvido');
    const resolved = items.filter(item => item.status === 'resolvida' || item.status === 'resolvido');
    const byKey = new Map(items.map(item => [item.key, item]));

    container.innerHTML = `
      <div class="card" style="margin:0 0 12px;background:#FAFAFA;">
        <div class="card-title">Nova pendência manual</div>
        <div class="form-row">
          <div class="form-group"><label>Título *</label><input id="pending-title" type="text" placeholder="Ex: Confirmar retorno após resultado"></div>
          <div class="form-group" style="max-width:180px;"><label>Vencimento</label><input id="pending-due" type="date"></div>
        </div>
        <div class="form-group"><label>Descrição</label><input id="pending-description" type="text" placeholder="Detalhe opcional"></div>
        <div class="form-actions"><button class="btn btn-primary btn-sm" id="pending-save">Adicionar pendência</button></div>
      </div>
      <div class="card-title">Pendências abertas</div>
      ${open.length ? open.map(item => renderItem(item, patientId)).join('') : '<div class="text-muted" style="padding:24px;text-align:center;">Nenhuma pendência clínica aberta.</div>'}
      ${resolved.length ? `<div class="card-title" style="margin-top:18px;">Resolvidas</div>${resolved.map(item => renderItem(item, patientId)).join('')}` : ''}`;

    container.querySelector('#pending-save')?.addEventListener('click', () => {
      const result = saveManualPending(patientId, {
        titulo: container.querySelector('#pending-title')?.value,
        descricao: container.querySelector('#pending-description')?.value,
        vencimento_em: container.querySelector('#pending-due')?.value
      });
      if (!result.ok) {
        if (typeof alert === 'function') alert('Informe um título para a pendência.');
        return;
      }
      renderClinicalPending(patientId, container);
    });

    container.querySelectorAll('[data-resolve-pending]').forEach(button => {
      button.addEventListener('click', () => {
        resolveManualPending(Number(button.dataset.resolvePending));
        renderClinicalPending(patientId, container);
      });
    });
    container.querySelectorAll('[data-pending-target]').forEach(button => {
      button.addEventListener('click', () => {
        const item = byKey.get(button.dataset.pendingTarget);
        if (item) openPendingTarget(item, patientId);
      });
    });
  }

  const api = { parseAppointmentDate, getFutureAppointments, buildPatientPending, saveManualPending, resolveManualPending, renderClinicalPending };
  root.PlennusClinicalPending = api;
  root.renderClinicalPending = renderClinicalPending;
  root.saveManualPending = saveManualPending;
  root.resolveManualPending = resolveManualPending;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
