# Design — Itens 7–12 da plataforma clínica

**Data:** 6 de setembro de 2026  
**Repositório:** `nutricionistaalmeidavh-spec/CLINICASMEDICAS`  
**Base:** `main` em `ae7eb6dabbe760e98ffb0529bc0f13cb8bc44d69`  
**Branch:** `feat/platform-clinical-7-12`

## Objetivo

Implementar os itens 7 a 12 sobre a arquitetura já modularizada e sobre os módulos clínicos 1–6, mantendo o aplicativo como Electron + HTML/CSS/JavaScript + `sql.js`, offline e com persistência local criptografada.

O pacote cobre:

7. busca global de pacientes;
8. importação CSV/XLSX com prévia e validação;
9. auditoria de alterações clínicas;
10. migrations versionadas e backup pré-migração;
11. evolução do motor de documentos/PDF;
12. shell visual e dashboard modernizados.

Não haverá migração para React, backend/cloud, Supabase ou troca de banco nesta entrega.

## Princípios de compatibilidade

- Agenda, PEP, Financeiro, autenticação e permissões atuais permanecem como fonte de verdade.
- IDs e handlers existentes só serão alterados quando houver teste de regressão cobrindo o fluxo.
- O schema será alterado apenas por migrations aditivas ou de normalização segura.
- Nenhum dado clínico será removido durante migração.
- Arquivos clínicos permanecem fora do SQLite; o banco guarda metadados.
- A auditoria registra eventos e metadados, não binários de anexos.
- O redesign altera shell e dashboard primeiro; as páginas internas continuam funcionais sem reescrita ampla.

---

## 7. Busca global de pacientes

### Experiência

A aplicação terá uma topbar persistente com busca global. O atalho `Ctrl+K` focará o campo.

A busca aceita:

- nome parcial;
- CPF com ou sem pontuação;
- telefone/celular como fallback opcional.

Os resultados aparecem em um painel compacto abaixo do campo, com nome, CPF e contato principal.

### Regras de acesso

- `admin` e `medico`: podem abrir o Patient Workspace/PEP do paciente.
- `recepcao`: pode localizar o paciente e abrir a página de cadastro/dados administrativos, sem ganhar acesso às abas clínicas restritas.

A busca nunca eleva permissões; ela apenas acelera a navegação já autorizada.

### Arquitetura

Novo core previsto:

- `js/core/global-search.js`

Responsabilidades:

- normalizar texto/CPF;
- consultar pacientes ativos;
- limitar resultados;
- resolver destino conforme perfil;
- controlar teclado, foco, Escape e seleção.

A consulta deve usar parâmetros SQL e limite pequeno, evitando varrer/renderizar listas grandes no DOM.

---

## 8. Importação CSV/XLSX

### Escopo desta entrega

A importação será apenas de **pacientes**. Não haverá importação de prontuários, exames, documentos ou dados financeiros neste pacote.

### Fluxo

1. administrador seleciona arquivo `.csv` ou `.xlsx`;
2. sistema lê o arquivo localmente;
3. mostra prévia antes de gravar;
4. aplica aliases de coluna;
5. valida cada linha;
6. aponta duplicidades prováveis;
7. usuário escolhe confirmar ou cancelar;
8. somente após confirmação os registros válidos são inseridos;
9. histórico da importação é persistido.

### Regras de duplicidade

Ordem de prioridade:

1. CPF normalizado igual a paciente existente;
2. nome normalizado + data de nascimento iguais;
3. linha sem critérios suficientes fica sinalizada para revisão, não é mesclada automaticamente.

O sistema não sobrescreverá paciente existente automaticamente.

### Aliases mínimos

Exemplos aceitos:

- `nome`, `nome completo`, `paciente` → `nome`;
- `cpf`, `documento` → `cpf`;
- `nascimento`, `data nascimento`, `data_nascimento` → `data_nascimento`;
- `celular`, `whatsapp`, `telefone celular` → `celular`;
- `telefone` → `telefone`;
- `email`, `e-mail` → `email`.

### Segurança e limites

- importação disponível somente para `admin`;
- arquivo processado localmente;
- tamanho e quantidade de linhas limitados;
- nenhuma fórmula do XLSX será executada;
- campos não mapeados são ignorados até revisão explícita;
- gravação deve ocorrer por lote controlado, com relatório final.

### Persistência

Nova tabela:

```sql
import_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  tipo TEXT NOT NULL,
  nome_arquivo TEXT,
  total_linhas INTEGER DEFAULT 0,
  inseridos INTEGER DEFAULT 0,
  ignorados INTEGER DEFAULT 0,
  erros INTEGER DEFAULT 0,
  resumo TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
)
```

Novo domínio previsto:

- `js/domains/imports.js`

Novo core previsto:

- `js/core/import-model.js`

O parser de XLSX ficará isolado atrás de uma interface pequena para que a biblioteca possa ser trocada sem afetar o restante do renderer. A dependência escolhida na implementação deverá ser mantida/pinada e passar pelo `npm audit`; se a opção escolhida introduzir vulnerabilidade relevante, a implementação deve parar e trocar de parser antes da entrega.

---

## 9. Auditoria clínica

### Objetivo

Criar rastreabilidade local de ações relevantes, sem vender a funcionalidade como conformidade regulatória completa.

### Eventos auditados

No mínimo:

- criação/edição de paciente;
- criação de atendimento PEP;
- alteração de alergias/comorbidades/medicação contínua;
- criação/revisão de exame;
- criação/revogação de consentimento;
- inclusão de arquivo clínico;
- criação/resolução de pendência clínica;
- emissão de documento;
- importação de pacientes;
- execução de migration.

### Estrutura

Nova tabela:

```sql
audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  usuario_nome TEXT,
  usuario_nivel TEXT,
  acao TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id INTEGER,
  campos_alterados TEXT,
  contexto TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
)
```

`campos_alterados` e `contexto` serão JSON textual compacto.

Não serão gravados:

- senha/hash;
- conteúdo binário;
- arquivo completo em base64;
- dumps integrais do banco;
- dados desnecessários de sessão.

### Arquitetura

Novo core:

- `js/core/audit.js`

API prevista:

```js
PlennusAudit.log({ acao, entidade, entidadeId, camposAlterados, contexto })
```

O helper usa o usuário autenticado atual e grava somente após a operação principal ter sido concluída com sucesso.

A auditoria não deve bloquear uma consulta clínica por falha de renderização, mas falha de escrita do log deve ser visível no console e tratada nos testes. Para operações de alto impacto como importação/migration, falha de auditoria interrompe a conclusão do processo.

---

## 10. Migrations versionadas e backup pré-migração

### Estado atual

O banco hoje executa `createTables()` e `addColumnIfNotExists()` de forma idempotente. Isso será preservado como base de compatibilidade, mas passará a existir versionamento explícito.

### Fonte de verdade

- `PRAGMA user_version` será a versão autoritativa do schema.
- Uma tabela `schema_migrations` será mantida para diagnóstico humano.

```sql
schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT DEFAULT (datetime('now','localtime'))
)
```

### Estratégia de migração

- Banco legado com `user_version = 0`: criar backup e executar migration de normalização da estrutura atualmente existente, incluindo os módulos 1–6.
- Banco novo: criar estrutura inicial e marcar a versão correspondente.
- Migrations posteriores rodam em ordem crescente, uma única vez.
- Cada migration deve ser idempotente o suficiente para tolerar schema parcialmente atualizado após interrupção.
- `user_version` só muda após sucesso integral da migration correspondente.

### Backup

Antes da primeira migration necessária em um banco existente, o processo principal copiará o arquivo criptografado atual para uma pasta de backups dentro de `userData`.

Formato sugerido:

`pre-migration-v<origem>-<timestamp>.db.enc`

Retenção padrão: 10 backups automáticos mais recentes.

Novo IPC restrito:

- `criar-backup-pre-migracao`;
- opcionalmente `listar-backups-automaticos` para Configurações.

O renderer não receberá acesso arbitrário ao filesystem.

### Arquitetura

Novo core:

- `js/core/migrations.js`

`js/database.js` continua dono da criação do banco e das consultas, mas delega a sequência de migrations para esse core.

---

## 11. Motor de documentos/PDF

### Estratégia

O fluxo existente baseado em HTML + `BrowserWindow.webContents.printToPDF()` será preservado. Não haverá substituição por um gerador PDF binário próprio nesta entrega.

A evolução será feita por uma camada de composição de documento reutilizável.

### Capacidades novas

- seções clínicas reutilizáveis;
- quebras de página explícitas;
- cabeçalho e rodapé consistentes;
- numeração visual de páginas quando suportada pelo Chromium/CSS;
- estilos de impressão separados do layout do app;
- anexação opcional de imagens clínicas selecionadas;
- limite de tamanho/quantidade de imagens;
- suporte a relatório longitudinal e resumo clínico multipágina.

### Segurança de imagens

Como o renderer não acessa `fs`, será criado IPC específico para leitura de imagem clínica permitida.

Regras:

- apenas caminhos absolutos já validados;
- somente extensões de imagem permitidas;
- limite de tamanho por imagem;
- retorno como Data URL somente para inclusão no documento;
- nenhum endpoint genérico de leitura de arquivo.

Novo IPC previsto:

- `ler-imagem-clinica-para-documento`.

### Arquitetura

Novo core/domínio:

- `js/core/document-renderer.js`

`js/domains/documents.js` e `js/domains/pep.js` passam a usar o renderer comum gradualmente, mantendo os botões e fluxos existentes.

---

## 12. Shell visual e dashboard modernizados

### Objetivo visual

Dar aparência de aplicativo desktop profissional sem trocar a stack nem reescrever as páginas internas.

### Shell

O shell terá:

- sidebar mais limpa e hierárquica;
- topbar persistente;
- busca global no topo;
- título/contexto da página atual;
- área de usuário mais compacta;
- espaçamento e tipografia consistentes;
- melhor contraste de estados ativo/hover/foco;
- layout responsivo para a largura mínima já suportada pelo Electron.

O shell preservará os `data-page`, `data-roles` e loaders existentes.

### Dashboard

O dashboard deixa de ser apenas quatro números + card de boas-vindas e passa a apresentar trabalho clínico real.

Blocos previstos:

- pacientes ativos;
- consultas de hoje;
- pacientes aguardando atendimento;
- pendências clínicas abertas;
- exames aguardando revisão;
- próximos atendimentos;
- ações rápidas coerentes com o perfil;
- saldo de caixa somente para perfis já autorizados a vê-lo.

Não haverá interpretação clínica automática.

### Estados vazios

Cada painel terá estado vazio informativo, por exemplo:

- “Nenhum paciente aguardando atendimento”;
- “Nenhum exame pendente de revisão”;
- “Nenhum atendimento restante hoje”.

### CSS e compatibilidade

`css/style.css` será reorganizado por tokens e blocos, mas sem introduzir framework CSS.

Novos tokens devem cobrir:

- superfícies;
- bordas;
- texto primário/secundário;
- espaçamento;
- radius;
- sombras;
- estados de foco;
- cores semânticas.

A cor institucional configurável continua respeitada; o redesign não deve fixar branding de modo que quebre a configuração existente.

---

## Permissões consolidadas

| Recurso | admin | medico | recepcao |
| --- | --- | --- | --- |
| Busca global | sim | sim | sim |
| Abrir Patient Workspace clínico | sim | sim | não |
| Abrir cadastro do paciente | sim | sim | sim |
| Importar pacientes | sim | não | não |
| Ver auditoria | sim | não | não |
| Criar atendimento/PEP | sim | sim | não |
| Emitir documentos clínicos | sim | sim | não |
| Dashboard clínico | sim | sim | parcial |
| Saldo financeiro no dashboard | sim | não | sim |

A implementação reutilizará `js/core/access-control.js` e não duplicará regras de perfil em vários módulos sem necessidade.

---

## Arquivos previstos

### Novos

- `js/core/global-search.js`
- `js/core/import-model.js`
- `js/core/audit.js`
- `js/core/migrations.js`
- `js/core/document-renderer.js`
- `js/domains/imports.js`
- testes correspondentes em `test/`

### Alterados

- `index.html`
- `css/style.css`
- `js/database.js`
- `js/core/navigation.js`
- `js/core/access-control.js`
- `js/domains/dashboard.js`
- `js/domains/patients.js`
- `js/domains/pep.js`
- `js/domains/documents.js`
- módulos clínicos 1–6 apenas onde necessário para auditoria/integração
- `main.js`
- `preload.js`
- `package.json` se houver dependência de parser de XLSX

---

## Testes e critérios de aceite

### Busca

- normalização de CPF;
- busca parcial por nome;
- limite de resultados;
- destino correto por perfil;
- atalho `Ctrl+K` e fechamento com Escape.

### Importação

- aliases;
- validação de linhas;
- duplicidade por CPF;
- duplicidade por nome + nascimento;
- prévia sem gravação;
- confirmação grava apenas válidos;
- histórico de importação.

### Auditoria

- evento após escrita clínica bem-sucedida;
- usuário/ação/entidade corretos;
- não registrar senha/hash/binário;
- importação e migration produzem evento.

### Migrations

- banco `user_version=0` migra sem perder tabelas/dados existentes;
- migration não roda novamente quando versão já aplicada;
- falha não avança `user_version`;
- backup é solicitado antes de migrar banco existente.

### Documentos

- HTML gerado possui estrutura A4 e seções;
- quebras de página são previsíveis;
- imagens permitidas podem ser incorporadas;
- arquivo não permitido é rejeitado;
- fluxo antigo de PDF continua disponível.

### Shell/dashboard

- todos os `data-page` existentes continuam navegáveis;
- RBAC do menu não regride;
- dashboard não mostra caixa a médico;
- estados vazios renderizam sem erro;
- busca global permanece disponível em todas as páginas autorizadas.

### Verificação final

Antes de considerar a entrega concluída:

1. `npm ci`;
2. `npm run lint`;
3. `npm test`;
4. CI da branch verde;
5. revisão de diff contra `main`;
6. nenhum merge em `main` sem autorização explícita.

O build/instalador Windows só será declarado validado se `npm run build` ou fluxo equivalente for realmente executado com sucesso em ambiente compatível.

---

## Fora do escopo

- backend/cloud/sincronização;
- multiunidade/multitenancy;
- telemedicina;
- interoperabilidade HL7/FHIR;
- assinatura digital certificada;
- importação de prontuários clínicos em lote;
- OCR de exames;
- diagnóstico ou recomendação clínica automatizada;
- troca de Electron, `sql.js` ou framework do renderer;
- redesign completo de todas as páginas internas.

## Sequência recomendada de implementação

1. migrations + backup;
2. auditoria;
3. busca global;
4. importação;
5. motor de documentos/PDF;
6. shell visual + dashboard;
7. regressão completa e CI.

Essa ordem reduz risco porque estabiliza persistência e rastreabilidade antes de introduzir fluxos de alto impacto e, por último, muda a camada visual sobre uma base já testada.
