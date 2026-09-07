# Entrega C — Storage clínico, criptografia e backup composto

## Objetivo
Concluir o isolamento físico iniciado nas Entregas A/B: anexos clínicos e banco clínico ficam no diretório exclusivo do profissional autenticado; backups passam a conter `clinic.db`, todos os bancos profissionais e anexos, com restauração validada e rollback.

## Regras
- Nenhum anexo clínico novo pode ser gravado em `userData/clinical-files`.
- O destino canônico é `userData/data/professionals/<professionalUid>/files/`.
- Selecionar, abrir e remover arquivo clínico exige sessão profissional vinculada à mesma janela Electron.
- `clinical.db.enc` permanece cifrado por `safeStorage`; a Entrega C não armazena chaves junto aos bancos.
- O backup composto usa criptografia portátil AES-256-GCM derivada da senha do backup e contém um manifesto versionado com hashes SHA-256.
- O backup composto deve incluir `clinic.db.enc` em forma SQLite descriptografada para portabilidade, os `clinical.db.enc` de cada profissional em forma SQLite descriptografada e os anexos associados.
- A restauração valida envelope, manifesto, hashes e SQLite antes de trocar qualquer dado ativo.
- A troca deve ser staged/atômica e possuir snapshot pré-restore para rollback.
- Backups V1/V2 existentes continuam aceitos como legado.
- O shadow clínico central permanece por compatibilidade durante esta entrega; o backup composto deixa de depender dele.

## Layout
```text
userData/data/
├── clinic/clinic.db.enc
└── professionals/
    └── <professionalUid>/
        ├── clinical.db.enc
        └── files/
            └── <uuid>.<ext>
```

## Formato de backup V3
`PLENNUS_BACKUP_V3` com payload criptografado contendo:
- `manifest`: versão, clinicUid, createdAt, profissionais e hashes;
- `clinicDatabase`: SQLite base64;
- `professionals[]`: professionalUid, database SQLite base64 e files[];
- cada arquivo: relativePath, mimeType, SHA-256 e bytes base64.

## Compatibilidade e migração
Ao primeiro uso de anexos por um profissional, arquivos legados já gerenciados em `clinical-files/` podem ser adotados somente quando o metadata do prontuário apontar explicitamente para eles. Não haverá distribuição automática de arquivos sem dono.
