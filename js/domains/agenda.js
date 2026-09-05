function atualizarInputsDataAgenda() {
  const filtroInput = document.getElementById('agenda-data-filtro');
  if (filtroInput) filtroInput.value = formatarDataParaIso(agendaDataAtual);
  const extensoEl = document.getElementById('agenda-data-extenso');
  if (extensoEl) extensoEl.textContent = formatarDataPorExtenso(agendaDataAtual);
  const agDataInput = document.getElementById('ag-data');
  if (agDataInput) agDataInput.value = formatarDataParaBr(agendaDataAtual);
}

function navegarDataAgenda(offset) {
  agendaDataAtual.setDate(agendaDataAtual.getDate() + offset);
  atualizarInputsDataAgenda();
  recarregarVisaoAgendaAtual();
}

function irParaHojeAgenda() {
  agendaDataAtual = new Date();
  atualizarInputsDataAgenda();
  recarregarVisaoAgendaAtual();
}

function aoMudarDataAgenda() {
  const val = document.getElementById('agenda-data-filtro').value;
  if (val) {
    const [y, m, d] = val.split('-').map(Number);
    agendaDataAtual = new Date(y, m - 1, d);
    atualizarInputsDataAgenda();
    recarregarVisaoAgendaAtual();
  }
}

function recarregarVisaoAgendaAtual() {
  const activeTab = document.querySelector('#page-agenda .tab-btn.active');
  const tab = activeTab ? activeTab.dataset.tab : 'visual';
  if (tab === 'visual') carregarAgendaVisual();
  else if (tab === 'espera') carregarSalaEspera();
  else if (tab === 'lista') carregarAgenda();
  else if (tab === 'grade') carregarGrade();
}

function toggleFormAgendamento(horaPreSelecionada) {
  const card = document.getElementById('card-novo-agendamento');
  if (!card) return;
  if (card.style.display === 'none' || card.style.display === '') {
    card.style.display = 'block';
    document.getElementById('ag-data').value = formatarDataParaBr(agendaDataAtual);
    if (horaPreSelecionada) document.getElementById('ag-hora').value = horaPreSelecionada;
    const profFiltro = document.getElementById('agenda-filtro-prof').value;
    if (profFiltro) document.getElementById('ag-profissional').value = profFiltro;
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    card.style.display = 'none';
  }
}

function carregarSelectsAgenda() {
  const pacs = DB.query('SELECT id, nome FROM pacientes WHERE ativo=1 ORDER BY nome');
  const profs = DB.query('SELECT id, nome, especialidade FROM profissionais WHERE ativo=1 ORDER BY nome');
  const optsP = ['<option value="">-- Selecione o Paciente --</option>']
    .concat(pacs.map(p => `<option value="${p.id}">${escapeHTML(p.nome)}</option>`)).join('');
  const optsProfSelect = ['<option value="">-- Selecione o Profissional --</option>']
    .concat(profs.map(p => `<option value="${p.id}">${escapeHTML(p.nome)} (${escapeHTML(p.especialidade || 'Clínico')})</option>`)).join('');
  const optsFiltroProf = ['<option value="">Todos os Profissionais</option>']
    .concat(profs.map(p => `<option value="${p.id}">${escapeHTML(p.nome)}</option>`)).join('');

  document.getElementById('ag-paciente').innerHTML = optsP;
  document.getElementById('ag-profissional').innerHTML = optsProfSelect;
  document.getElementById('grade-prof').innerHTML = optsProfSelect;
  const filtroProf = document.getElementById('agenda-filtro-prof');
  if (filtroProf && (!filtroProf.options.length || filtroProf.options.length <= 1)) filtroProf.innerHTML = optsFiltroProf;
  atualizarInputsDataAgenda();
  document.getElementById('ag-hora').value = agoraHora();
}

function getStatusBadge(status) {
  const map = {
    agendado: { label: 'Agendado', class: 'badge-admin', style: 'background:#E3F2FD;color:#1565C0;' },
    confirmado: { label: 'Confirmado', class: 'badge-medico', style: 'background:#E8F5E9;color:#2E7D32;' },
    espera: { label: 'Na Recepção', class: 'badge-recepcao', style: 'background:#FFF8E1;color:#F57F17;font-weight:700;' },
    atendimento: { label: 'Em Atendimento', class: 'badge-recepcao', style: 'background:#FFE0B2;color:#E65100;font-weight:700;' },
    realizado: { label: 'Realizado', class: 'badge-medico', style: 'background:#ECEFF1;color:#546E7A;' },
    cancelado: { label: 'Cancelado', class: 'badge-admin', style: 'background:#FFEBEE;color:#C62828;' }
  };
  const info = map[status] || { label: status, class: 'badge-admin', style: '' };
  return `<span class="badge-role ${info.class}" style="${info.style}">${escapeHTML(info.label)}</span>`;
}

function calcularTempoDecorridoMinutos(horaInicioStr) {
  return PlennusValidation.calcularMinutosDecorrido(horaInicioStr);
}

function carregarAgendaVisual() {
  const container = document.getElementById('timeline-slots-container');
  if (!container) return;
  const dataFiltroBr = formatarDataParaBr(agendaDataAtual);
  const profFiltroId = document.getElementById('agenda-filtro-prof') ? document.getElementById('agenda-filtro-prof').value : '';
  let sql = `
    SELECT a.*, p.nome as paciente, p.celular, p.telefone, pr.nome as profissional, pr.especialidade
    FROM agenda a
    LEFT JOIN pacientes p ON p.id=a.paciente_id
    LEFT JOIN profissionais pr ON pr.id=a.profissional_id
    WHERE a.data = ?`;
  const params = [dataFiltroBr];
  if (profFiltroId) {
    sql += ` AND a.profissional_id = ?`;
    params.push(profFiltroId);
  }
  sql += ` ORDER BY a.hora`;
  const rows = DB.query(sql, params);
  const appointmentsByHora = {};
  rows.forEach(r => {
    if (!appointmentsByHora[r.hora]) appointmentsByHora[r.hora] = [];
    appointmentsByHora[r.hora].push(r);
  });
  const defaultHoras = [];
  for (let h = 7; h <= 20; h++) {
    const hh = String(h).padStart(2, '0');
    defaultHoras.push(`${hh}:00`);
    if (h < 20) defaultHoras.push(`${hh}:30`);
  }
  const allHoras = Array.from(new Set([...defaultHoras, ...Object.keys(appointmentsByHora)])).sort();
  let html = '';
  allHoras.forEach(hora => {
    const agendamentos = appointmentsByHora[hora] || [];
    let contentHtml = '';
    if (agendamentos.length === 0) {
      contentHtml = `<div class="slot-empty" onclick="toggleFormAgendamento('${hora}')">+ Horário Livre (${hora})</div>`;
    } else {
      contentHtml = agendamentos.map(r => {
        const telefone = r.celular || r.telefone || '';
        const temContato = Boolean(telefone.trim());
        const statusClass = `status-${r.status || 'agendado'}`;
        let chegadaHtml = r.chegada_em ? `<span class="waiting-timer">🛎️ Chegou: ${escapeHTML(r.chegada_em)}</span>` : '';
        let botoesAcao = '';
        if (temContato) botoesAcao += `<button class="btn btn-sm btn-whatsapp" title="Enviar Confirmação WhatsApp" onclick="enviarMensagemWhatsApp(${r.id})">💬 WhatsApp</button> `;
        if (r.status === 'agendado' || r.status === 'confirmado') {
          botoesAcao += `<button class="btn btn-sm btn-warning" title="Registrar chegada na clínica" onclick="marcarChegadaEspera(${r.id})">🛎️ Chegou</button> `;
          botoesAcao += `<button class="btn btn-sm btn-success" title="Confirmar Presença" onclick="mudarStatus(${r.id}, 'confirmado')">✓</button> `;
        } else if (r.status === 'espera') {
          botoesAcao += `<button class="btn btn-sm btn-primary" title="Chamar para Atendimento" onclick="chamarParaAtendimento(${r.id}, ${r.paciente_id}, ${r.profissional_id})">🩺 Chamar</button> `;
        } else if (r.status === 'atendimento') {
          botoesAcao += `<button class="btn btn-sm btn-success" title="Finalizar Consulta" onclick="mudarStatus(${r.id}, 'realizado')">✔️ Concluir</button> `;
        }
        botoesAcao += `<button class="btn btn-sm btn-info" title="Abrir Prontuário" onclick="abrirProntuarioDaAgenda(${r.paciente_id}, ${r.profissional_id})">📋 PEP</button> `;
        if (r.status !== 'cancelado' && r.status !== 'realizado') botoesAcao += `<button class="btn btn-sm btn-danger" title="Cancelar Agendamento" onclick="mudarStatus(${r.id}, 'cancelado')">✕</button>`;
        return `
          <div class="appointment-card ${statusClass}">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <strong style="font-size:14px;color:#222;">${escapeHTML(r.paciente || 'Paciente')}</strong>
                ${getStatusBadge(r.status)}${chegadaHtml}
              </div>
              <div style="font-size:12px;color:#666;margin-top:4px;">
                👨‍⚕️ ${escapeHTML(r.profissional || 'Sem profissional')}
                ${r.observacao ? ` • <em>"${escapeHTML(r.observacao)}"</em>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">${botoesAcao}</div>
          </div>`;
      }).join('');
    }
    html += `<div class="timeline-slot"><div class="timeline-hour">${hora}</div><div class="timeline-slot-content">${contentHtml}</div></div>`;
  });
  container.innerHTML = html;
}

function carregarSalaEspera() {
  const colAgendadosEl = document.getElementById('coluna-agendados');
  const colEsperaEl = document.getElementById('coluna-espera');
  const colAtendidosEl = document.getElementById('coluna-atendidos');
  if (!colAgendadosEl || !colEsperaEl || !colAtendidosEl) return;
  const dataFiltroBr = formatarDataParaBr(agendaDataAtual);
  const profFiltroId = document.getElementById('agenda-filtro-prof') ? document.getElementById('agenda-filtro-prof').value : '';
  let sql = `
    SELECT a.*, p.nome as paciente, p.celular, p.telefone, pr.nome as profissional
    FROM agenda a
    LEFT JOIN pacientes p ON p.id=a.paciente_id
    LEFT JOIN profissionais pr ON pr.id=a.profissional_id
    WHERE a.data = ?`;
  const params = [dataFiltroBr];
  if (profFiltroId) {
    sql += ` AND a.profissional_id = ?`;
    params.push(profFiltroId);
  }
  sql += ` ORDER BY a.hora`;
  const rows = DB.query(sql, params);
  const listAgendados = rows.filter(r => r.status === 'agendado' || r.status === 'confirmado');
  const listEspera = rows.filter(r => r.status === 'espera');
  const listAtendidos = rows.filter(r => r.status === 'atendimento' || r.status === 'realizado');
  document.getElementById('badge-count-agendados').textContent = listAgendados.length;
  document.getElementById('badge-count-espera').textContent = listEspera.length;
  document.getElementById('badge-count-finalizados').textContent = listAtendidos.length;
  const vazioHtml = msg => `<div style="text-align:center;color:#999;padding:36px 12px;font-size:13px;">${msg}</div>`;

  colAgendadosEl.innerHTML = listAgendados.length ? listAgendados.map(r => {
    const tel = r.celular || r.telefone || '';
    return `
      <div class="espera-item" style="border-left:4px solid #1565C0;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;"><strong>${escapeHTML(r.paciente || '-')}</strong><span style="font-weight:700;color:#1565C0;">🕒 ${r.hora}</span></div>
        <div style="font-size:12px;color:#555;margin-bottom:8px;">Dr(a): <strong>${escapeHTML(r.profissional || '-')}</strong>${r.observacao ? `<br><small class="text-muted">${escapeHTML(r.observacao)}</small>` : ''}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn-sm btn-warning" onclick="marcarChegadaEspera(${r.id})">🛎️ Marcar Chegada</button>
          ${tel ? `<button class="btn btn-sm btn-whatsapp" onclick="enviarMensagemWhatsApp(${r.id})">💬 WhatsApp</button>` : ''}
          <button class="btn btn-sm btn-danger" onclick="mudarStatus(${r.id}, 'cancelado')">✕ Cancelar</button>
        </div>
      </div>`;
  }).join('') : vazioHtml('Nenhum paciente com consulta prevista');

  colEsperaEl.innerHTML = listEspera.length ? listEspera.map(r => {
    const minutos = calcularTempoDecorridoMinutos(r.chegada_em || r.hora);
    return `
      <div class="espera-item" style="border-left:4px solid #F57F17;background:#FFFDE7;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;"><strong>${escapeHTML(r.paciente || '-')}</strong><span style="font-weight:700;color:#E65100;">Previsto: ${r.hora}</span></div>
        <div style="font-size:12px;color:#555;margin-bottom:6px;">Dr(a): <strong>${escapeHTML(r.profissional || '-')}</strong></div>
        <div style="margin-bottom:10px;"><span class="waiting-timer">⏳ Aguardando há ${minutos} min (Chegou às ${escapeHTML(r.chegada_em || r.hora)})</span></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;"><button class="btn btn-sm btn-primary" onclick="chamarParaAtendimento(${r.id}, ${r.paciente_id}, ${r.profissional_id})">🩺 Chamar p/ Atendimento</button><button class="btn btn-sm btn-info" onclick="abrirProntuarioDaAgenda(${r.paciente_id}, ${r.profissional_id})">📋 Ver PEP</button></div>
      </div>`;
  }).join('') : vazioHtml('Nenhum paciente aguardando no momento');

  colAtendidosEl.innerHTML = listAtendidos.length ? listAtendidos.map(r => {
    const isAtendimento = r.status === 'atendimento';
    return `
      <div class="espera-item" style="border-left:4px solid ${isAtendimento ? '#E65100' : '#2E7D32'};background:${isAtendimento ? '#FFF3E0' : '#F1F8E9'};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;"><strong>${escapeHTML(r.paciente || '-')}</strong><span>${getStatusBadge(r.status)}</span></div>
        <div style="font-size:12px;color:#555;margin-bottom:8px;">Horário: <strong>${r.hora}</strong> • Dr(a): <strong>${escapeHTML(r.profissional || '-')}</strong></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;"><button class="btn btn-sm btn-info" onclick="abrirProntuarioDaAgenda(${r.paciente_id}, ${r.profissional_id})">📋 Abrir PEP</button>${isAtendimento ? `<button class="btn btn-sm btn-success" onclick="mudarStatus(${r.id}, 'realizado')">✔️ Concluir Atendimento</button>` : ''}</div>
      </div>`;
  }).join('') : vazioHtml('Nenhum atendimento em andamento ou finalizado');
}

function carregarAgenda() {
  const rows = DB.query(`
    SELECT a.*, p.nome as paciente, p.celular, p.telefone, pr.nome as profissional
    FROM agenda a
    LEFT JOIN pacientes p ON p.id=a.paciente_id
    LEFT JOIN profissionais pr ON pr.id=a.profissional_id
    ORDER BY a.data DESC, a.hora`);
  document.getElementById('tabela-agenda').innerHTML = rows.map(r => `
    <tr><td>${r.id}</td><td>${r.data}</td><td><strong>${r.hora}</strong></td><td>${escapeHTML(r.paciente || '-')}</td><td>${escapeHTML(r.profissional || '-')}</td><td>${getStatusBadge(r.status)}</td>
      <td>${(r.celular || r.telefone) ? `<button class="btn btn-sm btn-whatsapp" title="WhatsApp" onclick="enviarMensagemWhatsApp(${r.id})">💬</button>` : ''}
        ${(r.status === 'agendado' || r.status === 'confirmado') ? `<button class="btn btn-warning btn-sm" title="Marcar Chegada" onclick="marcarChegadaEspera(${r.id})">🛎️</button>` : ''}
        <button class="btn btn-success btn-sm" title="Confirmar" onclick="mudarStatus(${r.id},'confirmado')">✓</button>
        <button class="btn btn-danger btn-sm" title="Cancelar" onclick="mudarStatus(${r.id},'cancelado')">✗</button>
        <button class="btn btn-info btn-sm" title="Abrir Prontuário" onclick="abrirProntuarioDaAgenda(${r.paciente_id}, ${r.profissional_id})">PEP 📋</button></td></tr>`).join('');
}

function agendarConsulta() {
  const pid = document.getElementById('ag-paciente').value;
  const prid = document.getElementById('ag-profissional').value;
  const data = document.getElementById('ag-data').value.trim();
  const hora = document.getElementById('ag-hora').value.trim();
  const status = document.getElementById('ag-status').value || 'agendado';
  const obs = document.getElementById('ag-obs') ? document.getElementById('ag-obs').value.trim() : '';
  if (!pid || !prid || !data || !hora) return alert('Preencha todos os campos do agendamento.');
  if (!PlennusValidation.isValidDate(data) || !PlennusValidation.isValidTime(hora)) return alert('Informe data (DD/MM/AAAA) e hora (HH:MM) válidas.');
  const conflict = DB.query('SELECT id FROM agenda WHERE profissional_id=? AND data=? AND hora=? AND status != ?', [prid, data, hora, 'cancelado']);
  if (conflict.length) return alert('Este profissional já possui atendimento agendado neste horário.');
  DB.run('INSERT INTO agenda (paciente_id,profissional_id,data,hora,status,observacao) VALUES (?,?,?,?,?,?)', [pid, prid, data, hora, status, obs]);
  alert('Consulta agendada com sucesso!');
  const card = document.getElementById('card-novo-agendamento');
  if (card) card.style.display = 'none';
  recarregarVisaoAgendaAtual();
}

function mudarStatus(id, status) {
  DB.run('UPDATE agenda SET status=? WHERE id=?', [status, id]);
  recarregarVisaoAgendaAtual();
}

function marcarChegadaEspera(agendaId) {
  const hora = agoraHora();
  DB.run('UPDATE agenda SET status=?, chegada_em=? WHERE id=?', ['espera', hora, agendaId]);
  recarregarVisaoAgendaAtual();
}

function chamarParaAtendimento(agendaId, pacienteId, profissionalId) {
  DB.run('UPDATE agenda SET status=? WHERE id=?', ['atendimento', agendaId]);
  recarregarVisaoAgendaAtual();
  abrirProntuarioDaAgenda(pacienteId, profissionalId);
}

function enviarMensagemWhatsApp(agendaId) {
  const row = DB.query(`
    SELECT a.*, p.nome as paciente, p.celular, p.telefone, pr.nome as profissional
    FROM agenda a
    LEFT JOIN pacientes p ON p.id=a.paciente_id
    LEFT JOIN profissionais pr ON pr.id=a.profissional_id
    WHERE a.id = ?`, [agendaId])[0];
  if (!row) return alert('Agendamento não encontrado.');
  const telFormatado = PlennusValidation.formatarTelefoneWhatsApp(row.celular || row.telefone || '');
  if (!telFormatado) return alert('O paciente não possui telefone celular válido com DDD cadastrado.');
  const clinica = obterDadosClinica();
  const msg = PlennusValidation.gerarMensagemWhatsAppConfirmacao({ paciente: row.paciente, clinica: clinica.nome, profissional: row.profissional, data: row.data, hora: row.hora });
  const url = `https://api.whatsapp.com/send?phone=${telFormatado}&text=${encodeURIComponent(msg)}`;
  if (window.electronAPI && typeof window.electronAPI.abrirUrlExterna === 'function') window.electronAPI.abrirUrlExterna(url);
  else window.open(url, '_blank');
}

function carregarGrade() {
  const rows = DB.query(`SELECT g.*, p.nome as profissional FROM grade_horarios g LEFT JOIN profissionais p ON p.id=g.profissional_id ORDER BY g.profissional_id, g.dia_semana`);
  document.getElementById('tabela-grade').innerHTML = rows.map(r => `
    <tr><td>${r.id}</td><td>${escapeHTML(r.profissional)}</td><td>${DIAS[r.dia_semana]}</td><td>${escapeHTML(r.hora_inicio)}</td><td>${escapeHTML(r.hora_fim)}</td><td>${r.intervalo_minutos} min</td><td><button class="btn btn-danger btn-sm" onclick="excluirGrade(${r.id})">Excluir</button></td></tr>`).join('');
}

function salvarGrade() {
  const pid = document.getElementById('grade-prof').value;
  if (!pid) return alert('Selecione um profissional.');
  DB.run('INSERT INTO grade_horarios (profissional_id,dia_semana,hora_inicio,hora_fim,intervalo_minutos) VALUES (?,?,?,?,?)', [pid, document.getElementById('grade-dia').value, document.getElementById('grade-inicio').value, document.getElementById('grade-fim').value, document.getElementById('grade-intervalo').value || 30]);
  alert('Grade salva!');
  carregarGrade();
}

function excluirGrade(id) {
  if (!confirm('Excluir esta grade?')) return;
  DB.run('DELETE FROM grade_horarios WHERE id=?', [id]);
  carregarGrade();
}
