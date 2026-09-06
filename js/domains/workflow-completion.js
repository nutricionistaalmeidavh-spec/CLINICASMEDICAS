(function (root) {
  const guards = root.PlennusWorkflowGuards;
  const stability = root.PlennusWorkflowStability;
  if (!guards || !stability) return;

  function esc(value) {
    return typeof root.escapeHTML === 'function' ? root.escapeHTML(value) : String(value ?? '');
  }

  function enhancePatientSelect(selectId, emptyLabel = null) {
    const select = document.getElementById(selectId);
    if (!select || !root.DB?.isReady?.()) return;
    const selected = select.value;
    const rows = root.DB.query('SELECT id,nome,cpf,celular,telefone FROM pacientes WHERE ativo=1 ORDER BY nome');
    select.innerHTML = `${emptyLabel == null ? '' : `<option value="">${esc(emptyLabel)}</option>`}${rows.map(row => `<option value="${row.id}">${esc(guards.patientOptionLabel(row))}</option>`).join('')}`;
    if (selected && Array.from(select.options).some(option => option.value === selected)) select.value = selected;
  }

  function installPatientDisambiguation() {
    if (typeof root.carregarSelectsDocs === 'function') {
      const original = root.carregarSelectsDocs;
      root.carregarSelectsDocs = function carregarDocumentosComPacienteIdentificado(...args) {
        const result = original.apply(this, args);
        enhancePatientSelect('doc-paciente');
        return result;
      };
    }

    const odonto = root.PlennusOdontology;
    if (odonto?.carregarOdontologia) {
      const original = odonto.carregarOdontologia.bind(odonto);
      odonto.carregarOdontologia = function carregarOdontologiaComPacienteIdentificado(...args) {
        const result = original(...args);
        enhancePatientSelect('od-paciente', 'Selecione');
        return result;
      };
    }
  }

  function appointmentFromPepButton(button) {
    const onclick = button.getAttribute('onclick') || '';
    const match = onclick.match(/^abrirProntuarioDaAgenda\((\d+)\s*,\s*(\d+)\)$/);
    if (!match) return null;
    const patientId = Number(match[1]);
    const professionalId = Number(match[2]);
    const card = button.closest('.timeline-slot, .espera-item');
    if (!card) return null;
    const hourText = card.querySelector('.timeline-hour')?.textContent || card.textContent || '';
    const hourMatch = hourText.match(/(?:Previsto:\s*|Horário:\s*|🕒\s*)?(\d{2}:\d{2})/);
    if (!hourMatch) return null;
    const data = typeof agendaDataAtual !== 'undefined' && typeof root.formatarDataParaBr === 'function'
      ? root.formatarDataParaBr(agendaDataAtual)
      : root.hoje?.();
    if (!data) return null;
    return root.DB.query(`SELECT id FROM agenda
      WHERE paciente_id=? AND profissional_id=? AND data=? AND hora=?
      ORDER BY id DESC LIMIT 1`, [patientId, professionalId, data, hourMatch[1]])[0] || null;
  }

  function patchAgendaPepLinks() {
    document.querySelectorAll('[onclick^="abrirProntuarioDaAgenda("]').forEach(button => {
      const appointment = appointmentFromPepButton(button);
      if (!appointment) return;
      const match = (button.getAttribute('onclick') || '').match(/^abrirProntuarioDaAgenda\((\d+)\s*,\s*(\d+)\)$/);
      if (!match) return;
      button.setAttribute('onclick', `abrirProntuarioDaAgenda(${match[1]}, ${match[2]}, ${appointment.id})`);
    });
  }

  function installAgendaPepLinking() {
    if (typeof root.recarregarVisaoAgendaAtual !== 'function') return;
    const original = root.recarregarVisaoAgendaAtual;
    root.recarregarVisaoAgendaAtual = function recarregarAgendaComVinculoPep(...args) {
      const result = original.apply(this, args);
      patchAgendaPepLinks();
      return result;
    };
  }

  function installAtomicInitialStock() {
    document.addEventListener('click', event => {
      const button = event.target?.closest?.('#est-item-salvar');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const role = typeof currentUser !== 'undefined' ? currentUser?.nivel : null;
      if (!['admin', 'recepcao'].includes(role)) return alert('Acesso ao estoque não autorizado.');
      const model = root.PlennusOperationsModel;
      const name = document.getElementById('est-item-nome')?.value.trim() || '';
      if (!name) return alert('Informe o nome do insumo.');
      const initial = Math.max(0, model.toFiniteNumber(document.getElementById('est-item-inicial')?.value));
      const minimum = Math.max(0, model.toFiniteNumber(document.getElementById('est-item-minimo')?.value));
      try {
        stability.transact(() => {
          root.DB.run(`INSERT INTO estoque_itens (nome,codigo,unidade,fabricante,estoque_atual,estoque_minimo) VALUES (?,?,?,?,?,?)`, [
            name,
            document.getElementById('est-item-codigo')?.value.trim() || null,
            document.getElementById('est-item-unidade')?.value.trim() || 'un',
            document.getElementById('est-item-fabricante')?.value.trim() || null,
            initial,
            minimum
          ]);
          const itemId = root.DB.getLastId();
          if (initial > 0) {
            root.DB.run(`INSERT INTO estoque_movimentos
              (item_id,tipo,quantidade,delta,estoque_antes,estoque_depois,lote,validade,motivo,chave_origem)
              VALUES (?,?,?,?,?,?,?,?,?,?)`, [
              itemId, 'entrada', initial, initial, 0, initial,
              document.getElementById('est-item-lote')?.value.trim() || null,
              document.getElementById('est-item-validade')?.value || null,
              'Estoque inicial', `estoque-inicial:${itemId}`
            ]);
          }
        });
        ['est-item-nome','est-item-codigo','est-item-fabricante','est-item-lote','est-item-validade'].forEach(id => {
          const input = document.getElementById(id); if (input) input.value = '';
        });
        if (document.getElementById('est-item-inicial')) document.getElementById('est-item-inicial').value = '0';
        if (document.getElementById('est-item-minimo')) document.getElementById('est-item-minimo').value = '0';
        root.PlennusInventory?.carregarEstoque();
      } catch (error) {
        alert(error.message?.includes('UNIQUE') ? 'Já existe um insumo com esse código.' : `Não foi possível cadastrar: ${error.message}`);
      }
    }, true);
  }

  function gradeBlocksOverlap(startA, endA, startB, endB) {
    const aStart = guards.timeToMinutes(startA);
    const aEnd = guards.timeToMinutes(endA);
    const bStart = guards.timeToMinutes(startB);
    const bEnd = guards.timeToMinutes(endB);
    if ([aStart, aEnd, bStart, bEnd].some(value => value == null)) return false;
    return aStart < bEnd && bStart < aEnd;
  }

  function installGradeValidation() {
    root.salvarGrade = function salvarGradeValidada() {
      const professionalId = document.getElementById('grade-prof')?.value;
      const weekday = Number(document.getElementById('grade-dia')?.value);
      const start = document.getElementById('grade-inicio')?.value.trim();
      const end = document.getElementById('grade-fim')?.value.trim();
      const interval = Number(document.getElementById('grade-intervalo')?.value || 30);
      if (!professionalId) return alert('Selecione um profissional.');
      const startMinutes = guards.timeToMinutes(start);
      const endMinutes = guards.timeToMinutes(end);
      if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return alert('Informe início e fim válidos; o fim deve ser posterior ao início.');
      if (!Number.isInteger(interval) || interval < 5 || interval > 240) return alert('O intervalo deve ficar entre 5 e 240 minutos.');
      const blocks = root.DB.query('SELECT hora_inicio,hora_fim FROM grade_horarios WHERE profissional_id=? AND dia_semana=?', [professionalId, weekday]);
      if (blocks.some(block => gradeBlocksOverlap(start, end, block.hora_inicio, block.hora_fim))) return alert('Esta faixa se sobrepõe a outra grade já cadastrada para o profissional.');
      stability.transact(() => root.DB.run(`INSERT INTO grade_horarios
        (profissional_id,dia_semana,hora_inicio,hora_fim,intervalo_minutos) VALUES (?,?,?,?,?)`, [professionalId, weekday, start, end, interval]));
      alert('Grade salva!');
      root.carregarGrade?.();
    };
  }

  installPatientDisambiguation();
  installAgendaPepLinking();
  installAtomicInitialStock();
  installGradeValidation();

  root.PlennusWorkflowCompletion = {
    enhancePatientSelect,
    appointmentFromPepButton,
    patchAgendaPepLinks,
    gradeBlocksOverlap
  };
})(typeof window !== 'undefined' ? window : globalThis);
