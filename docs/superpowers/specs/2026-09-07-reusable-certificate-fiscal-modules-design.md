# Reusable Certificate and Fiscal Modules Design

## Goal

Add reusable commercial-service modules that can be embedded in Plennus Clinic and other Electron/JavaScript systems without coupling business logic to the host application.

## Scope

### Certificate Digital
- Provider abstraction with UTW as the first provider.
- Default ArtiSys store URL: `https://emitircertificadodigital.org/artisys`.
- Products shown by default: e-CNPJ A1 and e-CPF A1 at R$ 157,00.
- The host only opens the partner store; no certificate credentials or clinical data are sent by Plennus.
- Provider configuration is isolated so another reseller/certifier can replace UTW later.

### Fiscal
- Optional add-on. A clinic that does not connect a fiscal provider has no fiscal API cost.
- First provider: Focus NFe using the clinic's own Focus token/account.
- Focus token is stored only in the Electron main process using `safeStorage`, never in the renderer, database tables, logs, or UI status responses.
- Support both Focus NFS-e municipal (`/v2/nfse`) and NFS-e Nacional (`/v2/nfsen`) routes through one provider interface.
- Emission, status consultation and cancellation are performed in the main process.
- The reusable renderer module exposes connection/setup and fiscal issuance UI. A small Plennus adapter supplies clinic/patient data and mounts the module.
- No assumption is made that a particular tax code, CNAE, ISS rate, Simples Nacional status or municipality setting is correct. Fiscal profile fields remain configurable by the clinic/accountant.

## Architecture

```text
Plennus adapter
├── certificate-digital renderer module
│   └── UTW provider configuration
└── fiscal renderer module
    └── electronAPI.fiscal
         └── fiscal-main
              └── Focus client
                   ├── homologacao.focusnfe.com.br
                   └── api.focusnfe.com.br
```

Reusable files live under `js/modules/`. Host-specific mounting and DB reads live under `js/domains/`.

## Security

- Focus token is encrypted with Electron `safeStorage` in a dedicated `fiscal-connection.enc` file under `userData`.
- IPC handlers accept only whitelisted provider/environment/document types.
- API base URLs are hard-coded per supported environment; renderer input cannot choose arbitrary URLs.
- Reference IDs are validated as alphanumeric identifiers.
- Payload size is bounded before network transmission.
- Renderer can read connection metadata/status but never the token.
- External certificate-store navigation uses the already restricted `abrirUrlExterna` bridge.

## Plennus UX

### Configurações
A `Serviços para sua clínica` area contains:
- Certificado Digital: e-CNPJ/e-CPF, current partner prices and `Emitir ou renovar` action.
- Emissão Fiscal: provider, environment, token connection, connection status and fiscal profile fields.

### Financeiro
A compact `Emissão Fiscal` area is mounted without restructuring the existing finance domain. It can prepare NFS-e data from clinic/patient information and send through the connected provider. The feature is clearly optional.

## Reuse Contract

Certificate module public API:

```js
PlennusCertificateDigital.mount({
  container,
  provider,
  openExternal
});
```

Fiscal renderer public API:

```js
PlennusFiscal.mount({
  settingsContainer,
  financeContainer,
  api,
  hostAdapter
});
```

Fiscal main registration:

```js
registerFiscalIpc({ ipcMain, app, safeStorage, fetchImpl });
```

The host adapter is responsible for reading/writing non-secret fiscal profile data and supplying clinic/patient defaults.

## Initial provider behavior

Focus uses HTTP Basic authentication with the company's token as username and an empty password. Homologation uses `https://homologacao.focusnfe.com.br`; production uses `https://api.focusnfe.com.br`. Municipal NFS-e uses `/v2/nfse`; National NFS-e uses `/v2/nfsen`.

## Out of scope for this delivery

- Plennus paying or reselling Focus usage centrally.
- Automatic onboarding/contracting of a Focus account.
- Automatic tax advice or selection of fiscal codes.
- NF-e/NFC-e product-sale flows.
- Automatic handling of every municipality-specific field beyond the common Focus NFS-e schema.
