---
key: CFG-03
title: "Diagnóstico do ambiente: Docker, git, gh, Node e Sandcastle"
type: issue
milestone: "Fase 2 — Projetos, credenciais e ferramentas"
labels: [tipo:feature, area:ferramentas]
depends_on: [PRJ-01, DS-04, F-09]
---

## Contexto
Atende RF-CFG-03. Cada nó de agente roda em Docker (premissa do PRD), e PRs usam o `gh`. Quando algo falta, o
usuário precisa de uma tela que diga exatamente o quê e como resolver, em vez de uma run falhando com erro
obscuro. Usa o `CommandRunner` de #{PRJ-01}.

## Objetivo
`GET /api/diagnostics` devolve o estado de Node, git, Docker (cliente e daemon), `gh` (instalado e autenticado) e
`@ai-hero/sandcastle` (versão), e `/settings/diagnostics` mostra cada item com o que fazer quando falha.

## Escopo
**Inclui:** service de diagnóstico, rota, tela, cache de 30 s, botão "verificar de novo".
**Não inclui:** imagem do agente (#{RT-06} acrescenta o item "imagem"), teste de credencial (#{RT-08}).

## Especificação técnica
### Arquivos
Criar:
- `src/shared/diagnostic_types.ts`
- `src/server/diagnostics/diagnostic_checks.ts`
- `src/server/diagnostics/diagnostic_service.ts`
- `src/server/diagnostics/diagnostics_routes.ts`
- `src/server/diagnostics/diagnostic_service.test.ts`
- `src/web/app/settings/diagnostics_page.test.tsx`
Alterar:
- `src/web/app/settings/diagnostics_page.tsx` (substituir o placeholder)
- (o arquivo `*_routes.ts` desta issue já existe como stub criado em #{F-03}: substitua o conteúdo; **não** altere `src/server/route_modules.ts`)

### Contratos
```ts
export type DiagnosticStatus = "ok" | "warning" | "error";
export interface DiagnosticItem { id: string; label: string; status: DiagnosticStatus; detail: string; fix?: string }
export interface DiagnosticReport { checkedAt: string; items: DiagnosticItem[] }

export type DiagnosticCheck = (deps: { commands: CommandRunner; nodeVersion: string; readPackageVersion(name: string): string | undefined }) => Promise<DiagnosticItem>;
export const DIAGNOSTIC_CHECKS: DiagnosticCheck[]; // ordem de exibição; #{RT-06} acrescenta um item
export function createDiagnosticService(deps: { checks: DiagnosticCheck[]; commands: CommandRunner; clock: Clock; cacheMs?: number }): { run(force?: boolean): Promise<DiagnosticReport> };
```
Checks: `node` (≥ 22, senão error), `git --version`, `docker version --format '{{.Server.Version}}'` (cliente sem daemon →
error "Docker instalado mas não está rodando"; ausente → error com fix "instale o Docker Desktop"), `gh --version`
e `gh auth status` (sem auth → warning "PRs e issues do GitHub não vão funcionar"; fix `gh auth login`),
`sandcastle` (versão instalada de `@ai-hero/sandcastle`). Cada comando com timeout de 10 s; timeout → error com detalhe.

### Passo a passo
1. Implemente cada check como função pura sobre o `CommandRunner`.
2. Service com cache e `force`.
3. Rota `GET /api/diagnostics?force=1`.
4. Tela: lista com ícone de status (ok `CheckCircle2`, warning `AlertTriangle`, error `XOctagon`), detalhe em mono e "Como resolver"; botão "Verificar de novo".

### Notas de design
Superfície de configurações. Um resumo no topo ("Tudo pronto para rodar agentes" ou "2 problemas impedem rodar agentes").

## Critérios de aceite
- [ ] Com o fake simulando tudo ok, todos os itens ficam `ok`.
- [ ] Docker sem daemon gera `error` com a mensagem e o fix documentados.
- [ ] `gh` sem autenticação gera `warning`.
- [ ] Um comando que excede o timeout não trava a rota.
- [ ] A tela mostra o resumo, os itens e refaz a verificação.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `diagnostic_service.test.ts` (FakeCommandRunner, FakeClock): cada cenário acima, cache e `force`.
- `diagnostics_page.test.tsx`: renderização do resumo e dos itens.
