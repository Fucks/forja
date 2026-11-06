---
key: QA-03
title: "Endurecimento de segurança local e auditoria"
type: issue
milestone: "Fase 11 — Qualidade e lançamento"
labels: [tipo:seguranca, area:fundacao]
depends_on: [RT-08, GIT-04, OBS-04]
---

## Contexto

Atende RNF-SEG-01, RNF-SEG-02 e a regra de auditoria do PRD. Mesmo só em `127.0.0.1`, uma API local sem proteção pode ser
chamada por qualquer site aberto no navegador (CSRF / DNS rebinding) — e essa API inicia agentes com credenciais. Esta issue
fecha essas portas e grava a trilha de auditoria.

## Objetivo

A API exige um token de sessão local, recusa `Origin`/`Host` estranhos, e as ações sensíveis ficam registradas em
`audit_log`, com testes que provam que segredos não vazam em logs nem em argumentos de processo.

## Escopo

**Inclui:** token de sessão (gerado no boot, entregue à SPA via cookie `HttpOnly; SameSite=Strict`), checagem de `Host` e
`Origin`, exceção para `/api/hooks/*` (token próprio), `audit_log`, testes de vazamento, cabeçalhos de segurança.
**Não inclui:** login de usuário (monousuário).

## Especificação técnica

### Arquivos

Criar:

- `src/server/security/session_token.ts`
- `src/server/security/request_guard.ts`
- `src/server/security/request_guard.test.ts`
- `src/server/db/migrations/0950_audit_log.sql`
- `src/server/db/schema/audit_log.ts`
- `src/server/security/audit_log.ts`
- `src/server/security/audit_log.test.ts`
- `src/server/security/secret_leak.test.ts`
  Alterar:
- `src/server/app.ts` (registrar o guard e cabeçalhos)
- `src/server/static/static_routes.ts` (definir o cookie ao servir `index.html`)
- `src/web/api/api_client.ts` e `src/web/api/use_event_stream.ts` (`credentials: "same-origin"`)
- `src/server/flows/flow_service.ts`, `src/server/credentials/credential_service.ts`, `src/server/approvals/approval_service.ts`, `src/server/runs/run_service.ts` (chamar `audit.record`)

### Contratos

```ts
export function createSessionToken(): string; // 32 bytes base64url, gerado a cada boot
export function checkRequest(
    req: {
        method: string;
        url: string;
        headers: Record<string, string | undefined>;
        cookies: Record<string, string>;
        remoteAddress: string;
    },
    ctx: { token: string; port: number },
): { ok: true } | { ok: false; status: 401 | 403; reason: string };
// Host deve ser 127.0.0.1:<port> ou localhost:<port>; Origin (se presente) idem; cookie forja_session = token; /api/hooks/* só checa remoteAddress local
export type AuditAction =
    | "flow.published"
    | "credential.created"
    | "credential.updated"
    | "credential.deleted"
    | "approval.resolved"
    | "run.canceled";
export interface AuditLog {
    record(
        action: AuditAction,
        target: { kind: string; id: string },
        details?: Record<string, unknown>,
    ): Promise<void>;
    list(limit: number): Promise<unknown[]>;
}
```

Cabeçalhos: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Content-Security-Policy` restritiva para a SPA (`default-src 'self'`; `style-src 'self' 'unsafe-inline'` se o React Flow exigir).
Em dev (Vite na 5317), o proxy repassa o cookie; aceite `Host` `localhost:5317` só quando `NODE_ENV=development`.

### Passo a passo

1. Guard e token com testes.
2. Cookie ao servir a SPA; cliente com `same-origin`.
3. Auditoria nas ações.
4. `secret_leak.test.ts`: registra um segredo, roda um NodeRun no fake que imprime o segredo e chama `CommandRunner` — verifica que o arquivo de log e os argumentos registrados no fake não contêm o valor.

## Critérios de aceite

- [ ] Requisição sem cookie → 401; `Host` ou `Origin` estranho → 403.
- [ ] A SPA servida pelo próprio servidor funciona normalmente.
- [ ] Webhook continua funcionando só com o token do gatilho e a partir do localhost.
- [ ] As seis ações auditáveis gravam `audit_log`.
- [ ] Teste de vazamento prova que o segredo não aparece em logs nem em argv.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `request_guard.test.ts`, `audit_log.test.ts`, `secret_leak.test.ts`.
