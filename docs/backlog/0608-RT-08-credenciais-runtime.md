---
key: RT-08
title: "Credenciais no runtime e teste de credencial"
type: issue
milestone: "Fase 6 — Runtime Sandcastle"
labels: [tipo:seguranca, area:credenciais]
depends_on: [RT-07, CFG-02]
---

## Contexto
Atende RF-CFG-01 e RNF-SEG-02. O agente no container precisa de `ANTHROPIC_API_KEY` **ou** `CLAUDE_CODE_OAUTH_TOKEN`
(do `claude setup-token`, usa a assinatura) e, para o `gh`, de `GH_TOKEN`. A documentação do Claude Code diz que, em
`-p`, a API key sempre vence a assinatura — então nunca injete as duas ao mesmo tempo. Segredos vão só por env do
container (nunca argv nem arquivo). O botão "Testar" da tela de credenciais (#{CFG-02}) roda um agente mínimo.

## Objetivo
O executor monta o env do container a partir da credencial do nó/projeto (e da credencial GitHub), registra os valores
no redator, e `POST /api/credentials/:id/check` valida a credencial com um run headless mínimo.

## Escopo
**Inclui:** `buildAgentEnv`, integração no executor, verificação de credencial, gravação do resultado.
**Não inclui:** rotação automática de tokens.

## Especificação técnica
### Arquivos
Criar:
- `src/integrations/agent_runtime/agent_env.ts`
- `src/integrations/agent_runtime/agent_env.test.ts`
- `src/server/credentials/credential_check.ts`
- `src/server/credentials/credential_check.test.ts`
Alterar:
- `src/server/runtime/executor.ts`
- `src/server/credentials/credentials_routes.ts` (rota de teste)
- `src/web/app/settings/credentials_page.tsx` (botão "Testar" e resultado)

### Contratos
```ts
export function buildAgentEnv(input: { claude?: { kind: "anthropic_api_key" | "claude_oauth_token"; value: string }; github?: string; extra: Record<string, string> }): Record<string, string>;
// claude api key → ANTHROPIC_API_KEY; oauth → CLAUDE_CODE_OAUTH_TOKEN (e garante que ANTHROPIC_API_KEY não vai junto); github → GH_TOKEN e GITHUB_TOKEN
export class MissingCredentialError extends Error {} // nó de agente sem credencial do Claude resolvida

export async function checkCredential(id: string, deps: { credentials: CredentialService; runtime: AgentRuntime; settings: SettingsService; clock: Clock }): Promise<{ ok: boolean; message: string }>;
// claude: runHeadless com prompt "Responda apenas OK", model haiku, maxIterations 1, timeout 2 min; github: exec `gh auth status` no host via CommandRunner
```
- Sem credencial do Claude no nó nem no projeto → o NodeRun falha com `kind: "workspace"` e mensagem "Configure uma
  credencial do Claude no projeto" (sem retentativa útil: marque `workspace` com `retries` 0 — acrescente esse caso
  especial em `decideRetry`, alterando `src/engine/retry_policy.ts`).
- Credencial `generic_env` referenciada por perfil vem pelo `extra`.

### Passo a passo
1. `buildAgentEnv` puro com testes.
2. Integração no executor (antes de abrir workspace/rodar headless).
3. `checkCredential` + rota `POST /api/credentials/:id/check` + `recordCheck`.
4. Botão "Testar" na tela com resultado inline.

## Critérios de aceite
- [ ] Token OAuth gera `CLAUDE_CODE_OAUTH_TOKEN` e nunca `ANTHROPIC_API_KEY` no mesmo env.
- [ ] O token do GitHub vai como `GH_TOKEN` e `GITHUB_TOKEN`.
- [ ] Nenhum segredo aparece em argumentos de comando (teste inspeciona as chamadas da fachada).
- [ ] Nó sem credencial falha com a mensagem clara e sem retentativas.
- [ ] "Testar" mostra sucesso ou o erro do agente; `lastCheckedAt` é atualizado.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `agent_env.test.ts`, `credential_check.test.ts` (FakeAgentRuntime com sucesso e erro), ajuste em `executor.test.ts`.
