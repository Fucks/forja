---
key: CFG-05
title: "Configurações do projeto e globais"
type: issue
milestone: "Fase 2 — Projetos, credenciais e ferramentas"
labels: [tipo:feature, area:projetos]
depends_on: [PRJ-02, CFG-02, CFG-04, FLW-01]
---

## Contexto

Atende RF-PRJ-02 e RF-CFG-04. Nós de agente herdam do projeto o que não definem: credencial, modelo, effort, perfil de
ferramentas, system prompt e imagem Docker. O motor precisa de tetos globais (concorrência, intervalo entre inícios,
orçamento diário) e a manutenção precisa da retenção de logs.

## Objetivo

Existem `ProjectSettings` e `GlobalSettings` persistidos, com defaults, API e telas (`/projects/:id/settings` e
uma seção global na mesma tela de configurações), e o helper `resolveAgentDefaults` que o runtime vai usar.

## Escopo

**Inclui:** tabelas, service, rotas, telas, `resolveAgentDefaults`.
**Não inclui:** aplicar orçamento (#{ENG-07}), construir a imagem (#{RT-06}), limpar logs (#{QA-04}).

## Especificação técnica

### Arquivos

Criar:

- `src/shared/settings_types.ts`
- `src/server/db/migrations/0400_settings.sql`
- `src/server/db/schema/settings.ts`
- `src/server/settings/settings_repository.ts`
- `src/server/settings/settings_service.ts`
- `src/server/settings/settings_routes.ts`
- `src/server/settings/resolve_agent_defaults.ts`
- `src/server/settings/settings_service.test.ts`
- `src/server/settings/resolve_agent_defaults.test.ts`
- `src/web/app/projects/project_settings_page.test.tsx`
  Alterar:
- `src/web/app/projects/project_settings_page.tsx` (substituir o placeholder)
- (o arquivo `*_routes.ts` desta issue já existe como stub criado em #{F-03}: substitua o conteúdo; **não** altere `src/server/route_modules.ts`)

### Contratos

```ts
import { EFFORTS, type Effort } from "@/shared/agent_types"; // criado em #{FLW-01}
export const projectSettingsSchema = z.object({
    defaultCredentialId: z.string().nullable().default(null),
    githubCredentialId: z.string().nullable().default(null),
    defaultModel: z.string().default("claude-opus-5-5"),
    defaultEffort: z.enum(EFFORTS).default("high"),
    defaultToolProfileId: z.string().default("tlp_builtin_default"),
    systemPrompt: z.string().max(20_000).default(""), // anexado ao prompt de todo nó
    agentImage: z.string().default("forja-agent:latest"),
    maxConcurrentAgents: z.number().int().min(1).max(16).default(3),
    dailyBudgetUsd: z.number().positive().nullable().default(null),
    timezone: z.string().default("America/Sao_Paulo"),
});
export const globalSettingsSchema = z.object({
    maxConcurrentAgents: z.number().int().min(1).max(32).default(3),
    minStartIntervalMs: z.number().int().min(0).max(60_000).default(5_000),
    usageLimitMarginMinutes: z.number().int().min(0).max(120).default(5),
    logRetentionDays: z.number().int().min(1).max(365).default(30),
    logMaxTotalMb: z.number().int().min(100).max(100_000).default(2_048),
    modelPrices: z
        .record(
            z.string(),
            z.object({
                inputPerMTok: z.number(),
                outputPerMTok: z.number(),
                cacheReadPerMTok: z.number(),
                cacheWritePerMTok: z.number(),
            }),
        )
        .default({}),
});

export interface AgentDefaults {
    credentialId: string | null;
    model: string;
    effort: Effort;
    toolProfileId: string;
    systemPrompt: string;
    image: string;
}
export function resolveAgentDefaults(
    project: ProjectSettings,
    node: Partial<{ credentialId: string; model: string; effort: Effort; toolProfileId: string }>,
): AgentDefaults;
```

Tabelas `project_settings(project_id PK FK, json, updated_at)` e `global_settings(id = 'global', json, updated_at)`.
Rotas: `GET/PUT /api/projects/:id/settings`, `GET/PUT /api/settings`. PUT valida referências (credencial e perfil existentes → senão 422).

### Passo a passo

1. Tipos e schemas; leitura devolve defaults quando não há linha.
2. Service e rotas com validação de referências.
3. `resolveAgentDefaults` puro (nó sobrescreve projeto).
4. Tela do projeto em seções: "Agentes" (credencial, modelo, effort com SegmentedControl, perfil, system prompt em Textarea mono), "Execução" (concorrência, orçamento diário, fuso), "Container" (imagem). Seção global logo abaixo, com título "Toda a Forja".

### Notas de design

Valores herdados aparecem como placeholder "padrão: high". Salvar com barra fixa no rodapé quando há mudanças.

## Critérios de aceite

- [ ] Projeto sem configurações devolve os defaults.
- [ ] PUT com credencial ou perfil inexistente → 422.
- [ ] `resolveAgentDefaults` usa o valor do nó quando presente e o do projeto caso contrário.
- [ ] A tela salva e recarrega os valores dos dois níveis.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `settings_service.test.ts`: defaults, salvar, referências inválidas.
- `resolve_agent_defaults.test.ts`: combinações de sobrescrita.
- `project_settings_page.test.tsx`: editar effort e salvar.
