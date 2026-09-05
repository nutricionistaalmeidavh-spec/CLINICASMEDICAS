# Plennus Clinic – Electron

Sistema de Gestão de Clínicas e Consultórios (versão Electron).

## Como rodar (desenvolvimento)

```bash
npm install
npm start
```

## Como gerar o .exe (Windows)

```bash
npm install
npm run build
```

O instalador `.exe` será gerado na pasta `dist/`.

## Login padrão
- **Usuário:** admin  
- **Senha:** 123

## Módulos incluídos
- Dashboard
- Agenda + Grade de Horários
- Pacientes (com validação de CPF)
- Profissionais
- Convênios + Procedimentos
- Documentos (Receituário, Atestado, etc.)
- Caixa
- Repasses / Pró-labore
- Configurações + Backup

## Observações
- Dados salvos no localStorage (via sql.js)
- 100% offline
- Sem mensalidades
