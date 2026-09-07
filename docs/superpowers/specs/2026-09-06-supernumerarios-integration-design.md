# Integração de dentes supranumerários — design

## Objetivo
Integrar ao Plennus Clinic o módulo isolado de dentes supranumerários sem quebrar o modelo FDI existente, preservando isolamento clínico por profissional, planos, orçamentos, agenda, financeiro e backup V3.

## Decisões
- A funcionalidade é exclusivamente clínica e deve residir no `clinical.db` do profissional autenticado.
- O campo legado `dente INTEGER` permanece como referência FDI e compatibilidade.
- Supranumerários recebem identidade própria por `odontograma_elementos.id` e rótulo derivado `<FDI>-SN<indice>`.
- Condições, itens de plano e snapshots de orçamento passam a aceitar `elemento_dental_id` nullable.
- Dentes FDI comuns continuam com `elemento_dental_id = NULL`.
- Orçamentos armazenam `rotulo_dental` para preservar o snapshot mesmo quando o estado do elemento muda depois.
- O Hub LAN não recebe tabelas clínicas nem comandos clínicos.
- Backup V3 não muda de formato: as novas tabelas viajam dentro do SQLite profissional já incluído no backup composto.

## Schema
Nova tabela `odontograma_elementos`: `id`, `external_id`, `odontograma_id`, `profissional_id`, `elemento_tipo`, `dente_referencia_fdi`, `indice`, `denticao`, `status`, `ativo`, `criado_em`, `atualizado_em`.

Nova tabela `odontograma_elemento_eventos`: histórico imutável de criação e mudança de status/ativação.

Adicionar nullable `elemento_dental_id` a `odontograma_condicoes`, `plano_tratamento_itens` e `orcamento_odontologico_itens`; adicionar `rotulo_dental` ao snapshot de orçamento.

## Migração profissional
As migrations precisam ser executadas também ao abrir um `clinical.db` existente, antes de a sessão profissional ficar disponível para a UI. A migration é aditiva e idempotente.

## Isolamento
As duas novas tabelas entram em `CLINICAL_TABLES`. O pruning profissional remove elementos/eventos não pertencentes aos odontogramas/pacientes permitidos. Nenhuma nova tabela entra no snapshot compartilhado do Hub.

## UI e fluxo
O odontograma mantém seleção FDI existente e acrescenta um trilho discreto de supranumerários. O profissional cria `SN1`, `SN2` etc. junto a um FDI válido. A seleção de um SN permite registrar condição/face e adicioná-lo a plano. Plano e orçamento exibem o rótulo dental. Agenda e financeiro continuam vinculados ao item do plano, sem receber colunas dentais novas.

## Compatibilidade
Odontogramas existentes continuam válidos. Nenhum dado legado é reescrito em massa. O caminho FDI existente deve permanecer operacional sem depender das novas tabelas.

## Critérios de aceite
1. Migration V4 funciona em banco legado e profissional existente.
2. FDI comum continua igual.
3. `11-SN1` e `11-SN2` podem coexistir.
4. Condição de SN não aparece no dente 11 comum.
5. SN entra em plano, orçamento, agenda e cobrança mantendo o rótulo correto.
6. Alterar status não apaga histórico.
7. Dados permanecem isolados por profissional.
8. Backup/restore V3 preserva elementos supranumerários.
9. CI completa permanece verde.
