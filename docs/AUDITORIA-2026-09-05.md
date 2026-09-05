# Auditoria técnica — Plennus Clinic

**Data:** 5 de setembro de 2026

**Ambiente avaliado:** Windows NT 10.0.26200.0, Node.js 24.19.0 e npm 11.17.0

**Escopo:** inventário funcional, inspeção da estrutura, diagnóstico do comando `npm start` e execução dos controles existentes.

## Resumo executivo

O Plennus Clinic é um aplicativo desktop Electron, offline, com persistência local baseada em `sql.js`. O código passou pela validação sintática configurada no projeto e pelos seis testes automatizados existentes.

O comando `npm start` está corretamente definido como `electron .`. Em execução dentro de um ambiente restrito, o processo Electron encerrou com código 1 antes de carregar o código da aplicação e sem emitir mensagem de erro. Fora desse isolamento, o mesmo comando permaneceu ativo e abriu o aplicativo. Assim, a falha reproduzida foi causada pelo bloqueio de aplicações gráficas do ambiente de execução, não por uma exceção identificada no código do sistema.

## Funcionalidades identificadas

- Autenticação local com perfis de administrador, médico e recepção.
- Menu e permissões diferentes conforme o perfil do usuário.
- Dashboard com indicadores operacionais.
- Cadastro, edição e inativação de pacientes, incluindo validação de CPF.
- Cadastro e manutenção de profissionais.
- Agenda diária, grade de horários e controle de status das consultas.
- Sala de espera, registro de chegada e chamada para atendimento.
- Geração de mensagem de confirmação de consulta para WhatsApp.
- Prontuário Eletrônico do Paciente (PEP), com estrutura SOAP, sinais vitais, IMC, CID-10, diagnóstico, conduta e prescrição.
- Histórico e impressão de atendimentos.
- Cadastro de convênios e procedimentos.
- Modelos de receitas, atestados, pedidos de exames, encaminhamentos e declarações.
- Exportação de documentos para PDF, texto e impressão.
- Controle de entradas, saídas e saldo de caixa.
- Cálculo, registro e pagamento de repasses e pró-labore.
- Cadastro, ativação e inativação de usuários.
- Configuração dos dados institucionais da clínica.
- Backup e restauração do banco local.
- Persistência offline com banco SQLite em memória, exportado para arquivo criptografado pelo Electron no Windows.

## Evidências executadas

| Verificação | Resultado |
| --- | --- |
| `npm run lint` | Aprovado; `main.js`, `preload.js`, `database.js`, `app.js` e `validations.js` sem erro sintático. |
| `npm test` | Aprovado; 6 testes, 0 falhas. |
| `npm start` no ambiente restrito | Falhou com código 1 e sem saída de erro. |
| `electron.exe --version` no ambiente restrito | Também falhou com código 1, antes de carregar a aplicação. |
| `npm start` fora do ambiente restrito | Processo permaneceu ativo e o aplicativo iniciou. |

Os testes existentes cobrem datas e horários, IMC, telefone para WhatsApp, mensagem de confirmação e cálculo de tempo de espera.

## Pontos de atenção

### Alta prioridade

1. **Electron fora de suporte.** O projeto fixa o Electron em `22.3.27`, versão encerrada em outubro de 2023. Ela não recebe correções atuais de segurança e compatibilidade. Recomenda-se planejar atualização incremental e testar banco, preload, PDF, impressão e empacotamento após a migração.

2. **Credenciais iniciais fracas.** Os usuários iniciais `admin`, `medico` e `recepcao` são criados com a senha `123`. O sistema deve exigir troca de senha no primeiro acesso e evitar credenciais previsíveis em uso real.

3. **Cobertura insuficiente de testes.** Os seis testes não exercitam autenticação, permissões, banco, migrações, agenda, prontuário, caixa, backup, PDF ou restauração. Um resultado verde atual não comprova esses fluxos principais.

### Média prioridade

1. **Ferramentas de desenvolvimento abertas automaticamente.** A janela principal chama `openDevTools()` ao iniciar e contém marcação de debug temporário. Isso deve ser condicionado ao modo de desenvolvimento antes de distribuir o aplicativo.

2. **Tratamento silencioso de falhas do banco.** Uma falha ao descriptografar ou carregar o banco retorna `null`, podendo fazer a interface criar um banco novo. É importante informar o usuário e preservar o arquivo problemático para recuperação.

3. **Aplicação monolítica.** Grande parte das regras de interface e negócio está concentrada em `js/app.js`, dificultando testes isolados e manutenção futura.

4. **Ausência anterior de controle de versão local.** A pasta avaliada não continha metadados Git. Este documento e o primeiro commit passam a estabelecer a linha de base do projeto.

## Recomendações de organização

1. Manter dependências e artefatos gerados fora do Git (`node_modules`, `dist` e instaladores).
2. Proteger a branch principal e trabalhar com branches curtas para correções e funcionalidades.
3. Adicionar integração contínua executando `npm ci`, `npm run lint` e `npm test`.
4. Criar testes de integração para login, agenda, prontuário, banco e backup antes de atualizar o Electron.
5. Registrar alterações relevantes em um changelog e associar releases a versões do instalador.

## Limitações desta auditoria

- Não foi realizada validação clínica, jurídica, regulatória ou de conformidade com a LGPD.
- Não foram executados testes completos de interface, impressão física, instalação NSIS ou restauração destrutiva de backup.
- Não houve análise histórica porque o repositório remoto estava vazio na data desta auditoria.
