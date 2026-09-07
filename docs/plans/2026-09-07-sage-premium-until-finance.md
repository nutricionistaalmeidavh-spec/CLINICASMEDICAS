# Sage Premium — Agenda, PEP, Odontologia e Financeiro

## Escopo
Continuar o redesign visual já integrado na main, aplicando a mesma linguagem Sage Premium aos módulos Agenda, Prontuário (PEP), Odontologia e Financeiro.

## Guardrails
- não alterar schema, migrations, banco, backup/restore ou Clinic Hub/LAN;
- preservar IDs, callbacks, permissões, seletores e contratos usados pelos módulos atuais;
- manter estados clínicos/financeiros semânticos (sucesso, alerta, perigo) distintos da cor de marca;
- evitar reescrever CRUD e regras de negócio para fins puramente visuais;
- executar TDD de contratos visuais antes das mudanças e validar CI/build Windows antes do merge.

## Entrega
1. Agenda: toolbar, abas, timeline, cards de atendimento e sala de espera.
2. PEP: seleção/paciente, cabeçalho clínico, SOAP, vitais, ações e timeline.
3. Odontologia: barra de paciente, tabs, odontograma, condições, planos e orçamentos.
4. Financeiro: KPIs, lançamento, competência, filtros e tabela.
5. Responsividade e coerência cruzada entre esses quatro módulos.
