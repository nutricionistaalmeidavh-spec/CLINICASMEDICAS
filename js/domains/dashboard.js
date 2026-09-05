function carregarDashboard() {
  const pac = DB.query('SELECT COUNT(*) as c FROM pacientes WHERE ativo=1')[0].c;
  const prof = DB.query('SELECT COUNT(*) as c FROM profissionais WHERE ativo=1')[0].c;
  const cons = DB.query('SELECT COUNT(*) as c FROM agenda WHERE data=?', [hoje()])[0].c;
  const saldoRow = DB.query(`SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN valor ELSE -valor END),0) as s FROM caixa`)[0];
  document.getElementById('stat-pacientes').textContent = pac;
  document.getElementById('stat-profissionais').textContent = prof;
  document.getElementById('stat-consultas').textContent = cons;
  document.getElementById('stat-saldo').textContent = formatMoney(saldoRow.s);
}
