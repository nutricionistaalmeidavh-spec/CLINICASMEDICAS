(function (root) {
  const guards = root.PlennusWorkflowGuards;
  if (!guards) return;

  function esc(value) {
    return typeof root.escapeHTML === 'function' ? root.escapeHTML(value) : String(value ?? '');
  }

  function transact(work) {
    root.DB.run('BEGIN IMMEDIATE');
    try {
      const result = work();
      root.DB.run('COMMIT');
      return result;
    } catch (error) {
      try { root.DB.run('ROLLBACK'); } catch (_) { /* no-op */ }
      throw error;
    }
  }

  function ensureColumn(table, column, definition) {
    const columns = root.DB.query(`PRAGMA table_info(${table})`).map(row => row.name);
    if (!columns.includes(column)) root.DB.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  function ensureSchema() {
    ensureColumn('agenda', 'duracao_minutos', 'INTEGER DEFAULT 30');
    ensureColumn('prontuario_atendimentos', 'agenda_id', 'INTEGER');
    root.DB.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_prontuario_atendimento_agenda ON prontuario_atendimentos(agenda_id) WHERE agenda_id IS NOT NULL');
  }

  function installSchemaHook() {
    if (!root.DB?.init || root.DB.__workflowSchemaHook === true) return;
    const originalInit = root.DB.init.bind(root.DB);
    root.DB.init = async function workflowAwareInit(...args) {
      const result = await originalInit(...args);
      ensureSchema();
      return result;
    };
    root.DB.__workflowSchemaHook = true;
  }

  function ensureAgendaDurationField() {
    if (document.getElementById('ag-duracao')) return;
    const hour = document.getElementById('ag-hora')?.closest('.form-group');
    if (!hour?.parentElement) return;
    const group = document.createElement('div');
    group.className = 'form-group';
    group.style.maxWidth = '120px';
    group.innerHTML = '<label>Duração (min) *</label><input type="number" id="ag-duracao" min="5" max="480" step="5" value="30">';
    hour.after(group);
  }

  function patientRows() {
    return root.DB.query('SELECT id,nome,cpf,celular,telefone FROM pacientes WHERE ativo=1 ORDER BY nome');
  }

  function enhancePatientSelect(selectId, emptyLabel) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const selected = select.value;
    const first = emptyLabel == null ? '' : `<option value="">${esc(emptyLabel)}</option>`;
    select.innerHTML = first + patientRows().map(patient => `<option value="${patient.id}">${esc(guards.patientOptionLabel(patient))}</option>`).join('');
    if (selected && Array.from(select.options).some(option => option.value === selected)) select.value = selected;
  }

  function refreshPepHeader(patientId) {
    const patient = root.DB.query('SELECT * FROM pacientes WHERE id=?', [patientId])[0];
    if (!patient) return;
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setText('pep-display-nome', patient.nome || '-');
    setText('pep-display-idade', typeof root.calcularIdade === 'function' ? root.calcularIdade(patient.data_nascimento) : (patient.data_nascimento || 'Não informada'));
    setText('pep-display-cpf', patient.cpf || 'Não informado');
    setText('pep-display-sangue', patient.tipo_sanguineo || 'Não informado');
    setText('pep-display-tel', patient.celular || patient.telefone || 'Não informado');
    const comorb = [];
    if (patient.comorbidades) comorb.push(patient.comorbidades);
    if (patient.medicamentos_continuos) comorb.push(`Em uso de: ${patient.medicamentos_continuos}`);
    setText('pep-display-comorbidades', comorb.join(' | ') || 'Nenhuma comorbidade registrada');
    const alertBox = document.getElementById('pep-alergia-alert');
    const alertText = document.getElementById('pep-alergia-text');
    if (alertBox && alertText) {
      if (patient.alergias?.trim()) {
        alertBox.className = 'pep-alert-box';
        alertText.innerHTML = `⚠️ <strong>ALERGIAS REGISTRADAS:</strong> ${esc(patient.alergias)}`;
      } else {
        alertBox.className = 'pep-alert-box no-allergy';
        alertText.innerHTML = '✅ <strong>Nenhuma alergia conhecida</strong>';
      }
    }
  }

  function installPepFixes() {
    const originalNew = root.novoAtendimentoPep;
    if (typeof originalNew === 'function') {
      root.novoAtendimentoPep = function stabilizedNewEncounter(...args) {
        root.__plennusCurrentAgendaId = null;
        return originalNew.apply(this, args);
      };
    }

    root.editarAlergiasRapido = function editarAlergiasSemPerderRascunho() {
      if (!root.selectedPepPacienteId && typeof selectedPepPacienteId === 'undefined') return;
      const patientId = typeof selectedPepPacienteId !== 'undefined' ? selectedPepPacienteId : root.selectedPepPacienteId;
      if (!patientId) return;
      const patient = root.DB.query('SELECT alergias,nome FROM pacientes WHERE id=?', [patientId])[0];
      if (!patient) return;
      const next = prompt(`Editar alergias conhecidas de ${patient.nome}:\n(Deixe em branco se o paciente não possui alergias conhecidas)`, patient.alergias || '');
      if (next === null) return;
      root.DB.run('UPDATE pacientes SET alergias=? WHERE id=?', [next.trim(), patientId]);
      refreshPepHeader(patientId);
      root.refreshPatientWorkspace?.(patientId);
    };

    root.abrirProntuarioDaAgenda = function abrirProntuarioVinculado(pacienteId, profissionalId, agendaId) {
      root.navegar('prontuario');
      const patient = document.getElementById('pep-paciente');
      const professional = document.getElementById('pep-profissional');
      if (patient) patient.value = String(pacienteId || '');
      if (professional && profissionalId) professional.value = String(profissionalId);
      root.selecionarPacientePep?.(pacienteId);
      root.__plennusCurrentAgendaId = Number(agendaId) || null;
      if (root.__plennusCurrentAgendaId) {
        const existing = root.DB.query('SELECT id FROM prontuario_atendimentos WHERE agenda_id=? LIMIT 1', [root.__plennusCurrentAgendaId])[0];
        const hidden = document.getElementById('pep-atendimento-id');
        if (hidden && existing?.id) hidden.value = String(existing.id);
      }
      root.openPatientWorkspace?.(pacienteId, 'pep');
    };

    root.salvarAtendimentoPep = function salvarAtendimentoSemDuplicar() {
      const patientId = typeof selectedPepPacienteId !== 'undefined' ? selectedPepPacienteId : root.selectedPepPacienteId;
      if (!patientId) return alert('Selecione um paciente para registrar o atendimento.');
      const professionalId = document.getElementById('pep-profissional')?.value;
      if (!professionalId) return alert('Selecione o profissional de saúde responsável.');
      const field = id => document.getElementById(id);
      const type = field('pep-tipo-atendimento')?.value || 'Consulta';
      const subj = field('pep-subjetivo')?.value.trim() || '';
      const objective = field('pep-objetivo')?.value.trim() || '';
      const assessment = field('pep-avaliacao')?.value.trim() || '';
      const plan = field('pep-plano')?.value.trim() || '';
      const prescription = field('pep-prescricao')?.value.trim() || '';
      if (!subj && !assessment && !plan && !prescription) return alert('Preencha ao menos um dos campos clínicos da consulta (Subjetivo, Avaliação ou Conduta).');
      const payload = [
        patientId, professionalId, `${root.hoje()} ${root.agoraHora()}`, type, subj, objective,
        field('pep-pa')?.value.trim() || '', field('pep-fc')?.value.trim() || '', field('pep-temp')?.value.trim() || '',
        parseFloat(field('pep-peso')?.value) || null, parseFloat(field('pep-altura')?.value) || null, parseFloat(field('pep-imc')?.value) || null,
        assessment, field('pep-cid10')?.value.trim() || '', plan, prescription
      ];
      const hidden = field('pep-atendimento-id');
      const agendaId = Number(root.__plennusCurrentAgendaId) || null;
      let encounterId = Number(hidden?.value) || null;
      if (!encounterId && agendaId) encounterId = Number(root.DB.query('SELECT id FROM prontuario_atendimentos WHERE agenda_id=? LIMIT 1', [agendaId])[0]?.id) || null;
      try {
        transact(() => {
          if (encounterId) {
            root.DB.run(`UPDATE prontuario_atendimentos SET
              paciente_id=?,profissional_id=?,data_hora=?,tipo_atendimento=?,subjetivo_queixa=?,objetivo_exame=?,
              pressao_arterial=?,frequencia_cardiaca=?,temperatura=?,peso=?,altura=?,imc=?,avaliacao_diagnostico=?,
              cid10=?,plano_conduta=?,prescricao_medicamentos=?,agenda_id=COALESCE(?,agenda_id)
              WHERE id=?`, [...payload, agendaId, encounterId]);
          } else {
            root.DB.run(`INSERT INTO prontuario_atendimentos
              (paciente_id,profissional_id,data_hora,tipo_atendimento,subjetivo_queixa,objetivo_exame,
               pressao_arterial,frequencia_cardiaca,temperatura,peso,altura,imc,avaliacao_diagnostico,
               cid10,plano_conduta,prescricao_medicamentos,agenda_id)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...payload, agendaId]);
            encounterId = root.DB.getLastId();
          }
        });
        if (hidden) hidden.value = String(encounterId);
        alert('Atendimento salvo com sucesso no prontuário do paciente!');
        root.carregarTimelinePep?.(patientId);
        root.refreshPatientWorkspace?.(patientId, 'pep');
      } catch (error) {
        alert(`Não foi possível salvar o atendimento: ${error.message}`);
      }
    };
  }

  function agendaWeekday(dataBr) {
    const match = String(dataBr || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const day = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getDay();
    return (day + 6) % 7;
  }

  function validateScheduleBlock(professionalId, data, hour, duration) {
    const weekday = agendaWeekday(data);
    if (weekday == null) return { ok: false, message: 'Data inválida.' };
    const blocks = root.DB.query('SELECT hora_inicio,hora_fim FROM grade_horarios WHERE profissional_id=? AND dia_semana=? ORDER BY hora_inicio', [professionalId, weekday]);
    if (blocks.length && !blocks.some(block => guards.isWithinScheduleBlock(hour, duration, block.hora_inicio, block.hora_fim))) {
      return { ok: false, message: 'O horário fica fora da grade configurada para este profissional.' };
    }
    const appointments = root.DB.query("SELECT id,hora,COALESCE(duracao_minutos,30) duracao_minutos FROM agenda WHERE profissional_id=? AND data=? AND status!='cancelado'", [professionalId, data]);
    const conflict = appointments.find(row => guards.appointmentsOverlap(hour, duration, row.hora, row.duracao_minutos));
    return conflict ? { ok: false, message: `Conflito com o agendamento #${conflict.id} (${conflict.hora}).` } : { ok: true };
  }

  function installAgendaFixes() {
    ensureAgendaDurationField();
    const originalLoad = root.carregarSelectsAgenda;
    if (typeof originalLoad === 'function') {
      root.carregarSelectsAgenda = function carregarSelectsAgendaComIdentificacao(...args) {
        const result = originalLoad.apply(this, args);
        ensureAgendaDurationField();
        enhancePatientSelect('ag-paciente', '-- Selecione o Paciente --');
        return result;
      };
    }

    root.agendarConsulta = function agendarConsultaComDuracao() {
      const patientId = document.getElementById('ag-paciente')?.value;
      const professionalId = document.getElementById('ag-profissional')?.value;
      const data = document.getElementById('ag-data')?.value.trim();
      const hour = document.getElementById('ag-hora')?.value.trim();
      const status = document.getElementById('ag-status')?.value || 'agendado';
      const duration = guards.normalizeDuration(document.getElementById('ag-duracao')?.value, 30);
      const observation = document.getElementById('ag-obs')?.value.trim() || '';
      const procedureId = document.getElementById('ag-procedimento')?.value || null;
      const insuranceId = document.getElementById('ag-convenio')?.value || null;
      if (!patientId || !professionalId || !data || !hour) return alert('Preencha todos os campos do agendamento.');
      if (!root.PlennusValidation?.isValidDate(data) || !root.PlennusValidation?.isValidTime(hour)) return alert('Informe data (DD/MM/AAAA) e hora (HH:MM) válidas.');
      if (!['agendado', 'confirmado', 'espera'].includes(status)) return alert('Status inicial de agendamento inválido.');
      const validation = validateScheduleBlock(professionalId, data, hour, duration);
      if (!validation.ok) return alert(validation.message);
      let agendaId = null;
      try {
        transact(() => {
          root.DB.run(`INSERT INTO agenda
            (paciente_id,profissional_id,data,hora,duracao_minutos,status,observacao,procedimento_id,convenio_id)
            VALUES (?,?,?,?,?,?,?,?,?)`, [patientId, professionalId, data, hour, duration, status, observation, procedureId, insuranceId]);
          agendaId = root.DB.getLastId();
          root.PlennusOdontology?.onAppointmentCreated(agendaId);
          root.PlennusCRM?.onAppointmentStatusChanged(agendaId, status);
        });
        root.PlennusWhatsAppAutomation?.syncAppointmentMessages(agendaId);
        const card = document.getElementById('card-novo-agendamento');
        if (card) card.style.display = 'none';
        alert('Consulta agendada com sucesso!');
        root.recarregarVisaoAgendaAtual?.();
      } catch (error) {
        alert(`Não foi possível agendar: ${error.message}`);
      }
    };

    root.mudarStatus = function mudarStatusComTransicao(id, nextStatus) {
      const appointment = root.DB.query('SELECT * FROM agenda WHERE id=?', [id])[0];
      if (!appointment) return false;
      if (!guards.canTransitionAppointment(appointment.status, nextStatus)) {
        alert(`Transição inválida: ${appointment.status} → ${nextStatus}.`);
        return false;
      }
      if (appointment.status === nextStatus) return true;
      try {
        transact(() => {
          root.DB.run('UPDATE agenda SET status=? WHERE id=?', [nextStatus, id]);
          const dental = root.PlennusDentalFinance?.isDentalAppointment(id) === true;
          if (dental) root.PlennusDentalFinance?.onAppointmentStatusChanged(id, nextStatus);
          root.PlennusOdontology?.onAppointmentStatusChanged(id, nextStatus);
          root.PlennusCRM?.onAppointmentStatusChanged(id, nextStatus);
          if (!dental) root.PlennusFinanceAdvanced?.onAppointmentStatusChanged(id, nextStatus);
          if (nextStatus === 'realizado') root.PlennusInventory?.consumeForAppointment(id);
        });
        if (nextStatus === 'cancelado' || nextStatus === 'realizado') root.PlennusWhatsAppAutomation?.cancelAppointmentMessages(id);
        root.recarregarVisaoAgendaAtual?.();
        return true;
      } catch (error) {
        alert(`Não foi possível alterar o status: ${error.message}`);
        return false;
      }
    };

    root.marcarChegadaEspera = function marcarChegadaComTransicao(agendaId) {
      const appointment = root.DB.query('SELECT status FROM agenda WHERE id=?', [agendaId])[0];
      if (!appointment || !guards.canTransitionAppointment(appointment.status, 'espera')) return alert('Este agendamento não pode mais ser movido para a sala de espera.');
      transact(() => root.DB.run('UPDATE agenda SET status=?,chegada_em=? WHERE id=?', ['espera', root.agoraHora(), agendaId]));
      root.PlennusCRM?.onAppointmentStatusChanged(agendaId, 'espera');
      root.recarregarVisaoAgendaAtual?.();
    };

    root.chamarParaAtendimento = function chamarVinculandoAgenda(agendaId, pacienteId, profissionalId) {
      const appointment = root.DB.query('SELECT status FROM agenda WHERE id=?', [agendaId])[0];
      if (!appointment || !guards.canTransitionAppointment(appointment.status, 'atendimento')) return alert('Este paciente não está em um estado válido para iniciar atendimento.');
      transact(() => {
        root.DB.run('UPDATE agenda SET status=? WHERE id=?', ['atendimento', agendaId]);
        root.PlennusCRM?.onAppointmentStatusChanged(agendaId, 'atendimento');
      });
      root.recarregarVisaoAgendaAtual?.();
      root.abrirProntuarioDaAgenda?.(pacienteId, profissionalId, agendaId);
    };

    root.carregarAgenda = function carregarAgendaFiltradaEOrdenada() {
      const body = document.getElementById('tabela-agenda');
      if (!body) return;
      const date = typeof agendaDataAtual !== 'undefined' ? root.formatarDataParaBr(agendaDataAtual) : root.hoje();
      const professionalId = document.getElementById('agenda-filtro-prof')?.value || '';
      let sql = `SELECT a.*,p.nome paciente,p.celular,p.telefone,pr.nome profissional
        FROM agenda a LEFT JOIN pacientes p ON p.id=a.paciente_id LEFT JOIN profissionais pr ON pr.id=a.profissional_id
        WHERE a.data=?`;
      const params = [date];
      if (professionalId) { sql += ' AND a.profissional_id=?'; params.push(professionalId); }
      const rows = root.DB.query(sql, params).sort(guards.compareAppointments);
      body.innerHTML = rows.length ? rows.map(row => {
        const actions = [];
        if (row.celular || row.telefone) actions.push(`<button class="btn btn-sm btn-whatsapp" title="WhatsApp" onclick="enviarMensagemWhatsApp(${row.id})">💬</button>`);
        if (guards.canTransitionAppointment(row.status, 'confirmado')) actions.push(`<button class="btn btn-success btn-sm" title="Confirmar" onclick="mudarStatus(${row.id},'confirmado')">✓</button>`);
        if (guards.canTransitionAppointment(row.status, 'espera')) actions.push(`<button class="btn btn-warning btn-sm" title="Marcar chegada" onclick="marcarChegadaEspera(${row.id})">🛎️</button>`);
        if (!['realizado','cancelado'].includes(row.status)) actions.push(`<button class="btn btn-danger btn-sm" title="Cancelar" onclick="mudarStatus(${row.id},'cancelado')">✗</button>`);
        actions.push(`<button class="btn btn-info btn-sm" title="Abrir prontuário" onclick="abrirProntuarioDaAgenda(${row.paciente_id},${row.profissional_id},${row.id})">PEP 📋</button>`);
        return `<tr><td>${row.id}</td><td>${esc(row.data)}</td><td><strong>${esc(row.hora)}</strong>${row.duracao_minutos ? `<br><small>${row.duracao_minutos} min</small>` : ''}</td><td>${esc(row.paciente || '-')}</td><td>${esc(row.profissional || '-')}</td><td>${root.getStatusBadge(row.status)}</td><td>${actions.join(' ')}</td></tr>`;
      }).join('') : '<tr><td colspan="7" class="text-muted" style="text-align:center;padding:24px">Nenhum agendamento para os filtros selecionados.</td></tr>';
    };
  }

  function installInventoryTransactions() {
    const inventory = root.PlennusInventory;
    if (!inventory) return;
    inventory.consumeForAppointment = function consumeForAppointmentAtomic(agendaId) {
      const appointment = root.DB.query('SELECT id,paciente_id,procedimento_id FROM agenda WHERE id=?', [agendaId])[0];
      if (!appointment?.procedimento_id) return { consumed: 0, warnings: [] };
      const mappings = root.DB.query(`SELECT pe.*,ei.nome FROM procedimento_estoque pe JOIN estoque_itens ei ON ei.id=pe.item_id
        WHERE pe.procedimento_id=? AND pe.ativo=1 AND ei.ativo=1`, [appointment.procedimento_id]);
      let consumed = 0;
      const warnings = [];
      mappings.forEach((mapping, index) => {
        const originKey = `agenda:${agendaId}:item:${mapping.item_id}`;
        if (root.DB.query('SELECT id FROM estoque_movimentos WHERE chave_origem=?', [originKey])[0]) return;
        const item = root.DB.query('SELECT * FROM estoque_itens WHERE id=?', [mapping.item_id])[0];
        const savepoint = `stock_${index}`;
        root.DB.run(`SAVEPOINT ${savepoint}`);
        try {
          inventory.applyMovement(item, 'saida', mapping.quantidade, {
            recordType: 'saida_procedimento', motivo: `Consumo automático do procedimento #${appointment.procedimento_id}`,
            pacienteId: appointment.paciente_id, procedimentoId: appointment.procedimento_id, agendaId, chaveOrigem: originKey
          });
          root.DB.run(`RELEASE ${savepoint}`);
          consumed += 1;
        } catch (error) {
          root.DB.run(`ROLLBACK TO ${savepoint}`);
          root.DB.run(`RELEASE ${savepoint}`);
          warnings.push(`${mapping.nome}: ${error.message}`);
        }
      });
      if (warnings.length) alert(`Atendimento concluído, mas houve pendência de estoque:\n${warnings.join('\n')}`);
      return { consumed, warnings };
    };

    document.addEventListener('click', event => {
      const button = event.target?.closest?.('#est-mov-salvar');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const itemId = document.getElementById('est-mov-item')?.value;
      const item = root.DB.query('SELECT * FROM estoque_itens WHERE id=? AND ativo=1', [itemId])[0];
      if (!item) return alert('Selecione um insumo.');
      try {
        transact(() => inventory.applyMovement(item, document.getElementById('est-mov-tipo')?.value, document.getElementById('est-mov-quantidade')?.value, {
          lote: document.getElementById('est-mov-lote')?.value.trim() || null,
          validade: document.getElementById('est-mov-validade')?.value || null,
          motivo: document.getElementById('est-mov-motivo')?.value.trim() || 'Movimentação manual'
        }));
        ['est-mov-quantidade','est-mov-lote','est-mov-validade','est-mov-motivo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        inventory.carregarEstoque();
      } catch (error) {
        alert(error.message);
      }
    }, true);
  }

  function financeStatusBadge(status) {
    const map = { pago: ['Pago','status-ok'], pendente: ['Pendente','status-warn'], atrasado: ['Atrasado','status-danger'], cancelado: ['Cancelado','status-muted'] };
    const info = map[status] || [status,'status-muted'];
    return `<span class="operations-status ${info[1]}">${esc(info[0])}</span>`;
  }

  function paymentLabel(method) {
    const labels = { dinheiro:'Dinheiro',pix:'PIX',cartao_credito:'Cartão crédito',cartao_debito:'Cartão débito',boleto:'Boleto',transferencia:'Transferência',convenio:'Convênio',outro:'Outro' };
    return labels[method] || method || '-';
  }

  function carregarLancamentosSemPreLimit() {
    const body = document.getElementById('fin-tabela');
    if (!body || !root.PlennusOperationsModel) return;
    const model = root.PlennusOperationsModel;
    const statusFilter = document.getElementById('fin-filtro-status')?.value || '';
    const typeFilter = document.getElementById('fin-filtro-tipo')?.value || '';
    const today = model.localIsoDate();
    let sql = `SELECT f.*,p.nome paciente,c.nome categoria FROM financeiro_lancamentos f
      LEFT JOIN pacientes p ON p.id=f.paciente_id LEFT JOIN financeiro_categorias c ON c.id=f.categoria_id`;
    const params = [];
    if (typeFilter) { sql += ' WHERE f.tipo=?'; params.push(typeFilter); }
    sql += ' ORDER BY COALESCE(f.vencimento_em,f.criado_em) DESC,f.id DESC';
    const rows = root.DB.query(sql, params).filter(row => !statusFilter || model.classifyFinancialStatus(row, today) === statusFilter);
    body.innerHTML = rows.length ? rows.map(row => {
      const classified = model.classifyFinancialStatus(row, today);
      const actions = row.status === 'pendente'
        ? `<button class="btn btn-success btn-sm" onclick="PlennusFinanceAdvanced.liquidarLancamento(${row.id})">Dar baixa</button> <button class="btn btn-danger btn-sm" onclick="PlennusFinanceAdvanced.cancelarLancamento(${row.id})">Cancelar</button>` : '';
      return `<tr><td>${esc(row.vencimento_em || '-')}</td><td>${row.tipo === 'receita' ? 'Receita' : 'Despesa'}</td><td><strong>${esc(row.descricao)}</strong><br><small class="text-muted">${esc(row.categoria || '')}</small></td><td>${esc(row.paciente || '-')}</td><td>${root.formatMoney(Number(row.valor || 0))}</td><td>${financeStatusBadge(classified)}</td><td>${esc(paymentLabel(row.forma_pagamento))}</td><td>${actions}</td></tr>`;
    }).join('') : '<tr><td colspan="8" class="text-muted" style="text-align:center;padding:24px">Nenhum lançamento.</td></tr>';
  }

  function installFinanceFixes() {
    const finance = root.PlennusFinanceAdvanced;
    if (!finance) return;
    finance.liquidarLancamento = function liquidarSemBaixaAcidental(id) {
      const role = typeof currentUser !== 'undefined' ? currentUser?.nivel : null;
      if (!['admin','recepcao'].includes(role)) return alert('Acesso financeiro não autorizado.');
      let entry = root.DB.query('SELECT * FROM financeiro_lancamentos WHERE id=?', [id])[0];
      if (!entry || entry.status === 'cancelado') return;
      let method = entry.forma_pagamento || null;
      if (entry.status !== 'pago' && !method) {
        const answer = prompt('Forma de pagamento: dinheiro, pix, cartao_credito, cartao_debito, boleto, transferencia, convenio ou outro', 'pix');
        if (answer === null) return;
        method = root.PlennusOperationsModel.PAYMENT_METHODS.includes(answer) ? answer : null;
        if (!method) return alert('Forma de pagamento inválida. A baixa não foi realizada.');
      }
      try {
        transact(() => {
          if (entry.status !== 'pago') {
            root.DB.run("UPDATE financeiro_lancamentos SET status='pago',forma_pagamento=?,pago_em=?,atualizado_em=datetime('now','localtime') WHERE id=?", [method, root.PlennusOperationsModel.localIsoDate(), id]);
          }
          entry = root.DB.query('SELECT * FROM financeiro_lancamentos WHERE id=?', [id])[0];
          finance.ensureCashLink(entry);
          finance.ensurePayout(entry);
        });
        root.PlennusWhatsAppAutomation?.syncFinancialMessage(id);
        finance.carregarFinanceiroAvancado();
      } catch (error) {
        alert(`Não foi possível concluir a baixa: ${error.message}`);
      }
    };

    const originalLoad = finance.carregarFinanceiroAvancado.bind(finance);
    finance.carregarFinanceiroAvancado = function carregarFinanceiroCompleto(...args) {
      const result = originalLoad(...args);
      enhancePatientSelect('fin-paciente', 'Nenhum');
      carregarLancamentosSemPreLimit();
      ['fin-filtro-status','fin-filtro-tipo'].forEach(id => {
        const control = document.getElementById(id);
        if (control && control.dataset.noPreLimitBound !== '1') {
          control.dataset.noPreLimitBound = '1';
          control.addEventListener('change', carregarLancamentosSemPreLimit);
        }
      });
      return result;
    };
  }

  function installUsabilityFixes() {
    const originalPepSelects = root.carregarSelectsPep;
    if (typeof originalPepSelects === 'function') {
      root.carregarSelectsPep = function carregarPepComPacienteIdentificado(...args) {
        const result = originalPepSelects.apply(this, args);
        enhancePatientSelect('pep-paciente', '-- Selecione um paciente --');
        const patientId = typeof selectedPepPacienteId !== 'undefined' ? selectedPepPacienteId : null;
        if (patientId) document.getElementById('pep-paciente').value = String(patientId);
        return result;
      };
    }
  }

  installSchemaHook();
  installPepFixes();
  installAgendaFixes();
  installInventoryTransactions();
  installFinanceFixes();
  installUsabilityFixes();

  root.PlennusWorkflowStability = {
    ensureSchema,
    refreshPepHeader,
    validateScheduleBlock,
    carregarLancamentosSemPreLimit,
    transact
  };
})(typeof window !== 'undefined' ? window : globalThis);
