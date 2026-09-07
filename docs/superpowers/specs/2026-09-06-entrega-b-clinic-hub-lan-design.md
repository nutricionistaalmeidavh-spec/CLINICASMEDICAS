# Entrega B — Clinic Hub LAN Design

## Objetivo
Permitir que a recepção/admin e múltiplos profissionais usem o Plennus Clinic em computadores diferentes na mesma rede local, mantendo `clinical.db` de cada profissional fisicamente local e sem expor dados clínicos de um profissional a outro.

## Escopo desta entrega
- Um computador da clínica opera como **Clinic Hub** e é a autoridade para dados compartilhados (`clinic.db`).
- Computadores profissionais operam como **clientes LAN**.
- Descoberta automática do Hub por UDP, sem PII no beacon.
- Pareamento explícito de dispositivo antes de qualquer troca de dados.
- Canal de aplicação cifrado com AES-256-GCM usando chave de dispositivo derivada no pareamento.
- Login do usuário validado pelo Hub depois do pareamento.
- Sincronização apenas de dados compartilhados necessários ao profissional; `clinical.db` permanece no cliente profissional.
- Escritas compartilhadas do profissional usam fila de mutações restritas, idempotentes e autorizadas pelo Hub.
- Operação local da máquina Hub continua compatível com a Entrega A.

## Fora de escopo
- Internet/cloud, VPN, acesso externo à clínica.
- Sincronização entre clínicas.
- Transferência do `clinical.db` pela rede.
- SQL remoto livre.
- Backup composto definitivo de todos os bancos; o shadow central da Entrega A permanece por compatibilidade até a etapa específica de backup.

## Arquitetura

### Clinic Hub
Executa no processo principal Electron e possui:
1. `clinic.db` canônico local.
2. serviço HTTP restrito à LAN para `/health`, `/pair` e `/rpc`;
3. beacon/resposta de descoberta UDP;
4. registro criptografado de dispositivos pareados;
5. sessões de usuário com TTL;
6. política de comandos permitidos por papel.

O Hub não fornece acesso genérico ao filesystem, IPC ou SQL. O RPC recebe comandos de domínio limitados.

### Cliente profissional
O processo principal Electron:
1. descobre o Hub;
2. pareia uma única vez usando segredo temporário gerado pelo Hub;
3. salva a chave do dispositivo com `safeStorage`;
4. autentica o usuário no Hub;
5. recebe snapshots JSON das tabelas compartilhadas autorizadas;
6. mantém um espelho local para compatibilidade com o renderer síncrono existente;
7. envia mutações compartilhadas autorizadas em fila assíncrona.

O `clinical.db` continua local e só é aberto pela sessão profissional vinculada, preservando a Entrega A.

## Descoberta
- UDP porta `43126`.
- TCP/HTTP do Hub em `43127` por padrão.
- Beacon contém somente: `service`, `protocolVersion`, `hubId`, `clinicUid`, `port`, `hostname`.
- Apenas endereços loopback, RFC1918, link-local e IPv6 ULA/link-local são aceitos.
- Nenhum nome de paciente, usuário, token ou segredo é anunciado.

## Pareamento e criptografia
- Hub gera segredo aleatório temporário de alta entropia, apresentado em grupos legíveis e válido por 10 minutos.
- Cliente envia `deviceId`, nonce e prova HMAC; o segredo não é transmitido diretamente.
- Hub gera `deviceKey` aleatória de 32 bytes e a devolve cifrada com chave derivada do segredo de pareamento.
- Ambos persistem `deviceKey` via `safeStorage`.
- RPC usa AES-256-GCM, nonce único, AAD com versão + deviceId, janela de timestamp e proteção básica contra replay.

## Autorização
Pareamento autoriza o **dispositivo**, não o usuário. Cada sessão ainda exige login.

- `admin`: administração/recepção local no Hub nesta entrega.
- `recepcao`: operação local no Hub nesta entrega.
- `medico`: cliente LAN permitido; recebe somente snapshot compartilhado e comandos compatíveis com agenda/paciente.

O Hub rejeita qualquer ação clínica. Dados clínicos são responsabilidade exclusiva do banco profissional local.

## Dados compartilhados do profissional
Snapshot inicial autorizado:
- `pacientes`
- `profissionais`
- `procedimentos`
- `convenios`
- `configuracoes` com filtragem de chaves sensíveis
- `documentos_templates`
- `agenda`
- `grade_horarios`

Senhas, tokens, segredos e tabelas clínicas não entram no snapshot.

## Mutações remotas
A Entrega B não aceita SQL remoto. O cliente envia comandos normalizados, inicialmente:
- `agenda.updateStatus`
- `agenda.upsert`
- `patient.upsertBasic`

Cada comando contém `mutationId` UUID/hex estável para idempotência. O Hub valida papel, campos, ownership quando aplicável e grava em `clinic.db`. Repetição do mesmo `mutationId` não duplica efeito.

## Resiliência
- Sem Hub: profissional continua com `clinical.db` local e último espelho compartilhado, mas mutações compartilhadas ficam pendentes e UI deve sinalizar modo offline.
- Reconexão: fila é reenviada e depois o snapshot compartilhado é atualizado.
- Hub reiniciado: dispositivos pareados continuam válidos; sessão de usuário precisa ser refeita.
- Mensagens inválidas, antigas ou repetidas são rejeitadas.

## Compatibilidade
- Nenhum merge automático na `main`.
- Sem release nesta entrega.
- Banco legado e shadow clínico da Entrega A permanecem intactos.
- O renderer continua sem `nodeIntegration` e sem acesso direto a sockets/filesystem.

## Critérios de aceite
1. Hub inicia somente em interface LAN/loopback autorizada e anuncia sem PII.
2. Cliente descobre o Hub automaticamente.
3. Dispositivo não pareado não executa RPC.
4. Payload RPC é cifrado e replay é recusado.
5. Login inválido é recusado no Hub.
6. Usuário profissional recebe apenas tabelas compartilhadas permitidas.
7. Nenhum comando RPC acessa tabela clínica.
8. Mutações repetidas são idempotentes.
9. `clinical.db` profissional continua local e isolado.
10. Lint e suíte completa permanecem verdes.
