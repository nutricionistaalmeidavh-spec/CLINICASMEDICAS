(function (root) {
  const TYPES = [
    ['tratamento_dados', 'Tratamento de dados'],
    ['whatsapp', 'Contato por WhatsApp'],
    ['imagem_clinica', 'Uso de imagem clínica'],
    ['teleatendimento', 'Teleatendimento'],
    ['outro', 'Outro']
  ];

  function esc(value) {
    return typeof root.escapeHTML === 'function' ? root.escapeHTML(value) : String(value ?? '');
  }

  function nowSql() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  function listConsents(patientId) {
    return root.DB.query('SELECT * FROM consentimentos WHERE paciente_id=? ORDER BY id DESC', [patientId]);
  }

  function saveConsent(patientId, type, authorized, note) {
    const normalizedType = TYPES.some(item => item[0] === type) ? type : 'outro';
    const isAuthorized = authorized ? 1 : 0;
    const acceptedAt = isAuthorized ? nowSql() : null;
    root.DB.run(`INSERT INTO consentimentos
      (paciente_id, tipo, autorizado, aceito_em, observacao, atualizado_em)
      VALUES (?,?,?,?,?,?)`, [Number(patientId), normalizedType, isAuthorized, acceptedAt, String(note || '').trim() || null, nowSql()]);
    return { ok: true, id: root.DB.getLastId() };
  }

  function revokeConsent(id) {
    const timestamp = nowSql();
    root.DB.run('UPDATE consentimentos SET revogado_em=?, atualizado_em=? WHERE id=?', [timestamp, timestamp, id]);
    return { ok: true };
  }

  function typeLabel(type) {
    return TYPES.find(item => item[0] === type)?.[1] || 'Outro';
  }

  function statusLabel(status) {
    if (status === 'autorizado') return 'Autorizado';
    if (status === 'revogado') return 'Revogado';
    return 'Não autorizado';
  }

  function renderConsents(patientId, container) {
    const rows = listConsents(patientId);
    container.innerHTML = `
      <div class="card" style="margin:0 0 12px;background:#FAFAFA;">
        <div class="card-title">Registrar termo / consentimento</div>
        <div class="form-row">
          <div class="form-group"><label>Tipo</label><select id="consent-type">${TYPES.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('')}</select></div>
          <div class="form-group" style="max-width:180px;"><label>Decisão</label><select id="consent-authorized"><option value="1">Autorizado</option><option value="0">Não autorizado</option></select></div>
        </div>
        <div class="form-group"><label>Observação</label><input id="consent-note" type="text" placeholder="Contexto, versão do termo ou observação opcional"></div>
        <div class="form-actions"><button class="btn btn-primary btn-sm" id="consent-save">Registrar decisão</button></div>
      </div>
      <div class="card-title">Histórico de consentimentos</div>
      ${rows.length ? rows.map(row => {
        const status = root.PlennusClinicalModel.consentStatus(row);
        const canRevoke = status === 'autorizado';
        return `<div class="card" style="margin:8px 0;background:#FAFAFA;display:flex;justify-content:space-between;gap:12px;align-items:center;">
          <div><strong>${esc(typeLabel(row.tipo))}</strong> · <span>${esc(statusLabel(status))}</span>
            <div class="text-muted">${esc(row.aceito_em || row.criado_em || '')}${row.revogado_em ? ` · revogado em ${esc(row.revogado_em)}` : ''}</div>
            ${row.observacao ? `<div style="margin-top:4px;">${esc(row.observacao)}</div>` : ''}
          </div>
          ${canRevoke ? `<button class="btn btn-danger btn-sm" data-revoke-consent="${row.id}">Revogar</button>` : ''}
        </div>`;
      }).join('') : '<div class="text-muted" style="padding:24px;text-align:center;">Nenhum consentimento registrado.</div>'}`;

    container.querySelector('#consent-save')?.addEventListener('click', () => {
      saveConsent(
        patientId,
        container.querySelector('#consent-type')?.value,
        container.querySelector('#consent-authorized')?.value === '1',
        container.querySelector('#consent-note')?.value
      );
      renderConsents(patientId, container);
    });
    container.querySelectorAll('[data-revoke-consent]').forEach(button => {
      button.addEventListener('click', () => {
        if (typeof confirm === 'function' && !confirm('Revogar este consentimento? O histórico será preservado.')) return;
        revokeConsent(Number(button.dataset.revokeConsent));
        renderConsents(patientId, container);
      });
    });
  }

  const api = { TYPES, listConsents, saveConsent, revokeConsent, renderConsents };
  root.PlennusConsents = api;
  root.renderConsents = renderConsents;
  root.saveConsent = saveConsent;
  root.revokeConsent = revokeConsent;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
