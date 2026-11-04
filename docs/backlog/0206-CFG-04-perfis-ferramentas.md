---
key: CFG-04
title: "Perfis de ferramentas: MCP, CodeGraph e permissões"
type: issue
milestone: "Fase 2 — Projetos, credenciais e ferramentas"
labels: [tipo:feature, area:ferramentas]
depends_on: [PRJ-01, FLW-01, DS-04, F-09]
---

## Contexto
Atende RF-CFG-02 e RNF-SEG-03. Economizar tokens é um objetivo explícito: o CodeGraph dá ao agente busca por símbolo
em vez de ler arquivos inteiros, e cada nó deve ter só as ferramentas de que precisa (o revisor não precisa de
`Write`; o planner não precisa de `Bash`). Um **perfil de ferramentas** é um conjunto reutilizável aplicado a nós.
A aplicação no workspace é #{RT-07}.

## Objetivo
O usuário cria e edita perfis de ferramentas (MCP servers, ferramentas permitidas e proibidas, modo de permissão)
em `/settings/tool-profiles`, com um preset "CodeGraph" pronto.

## Escopo
**Inclui:** tabela, service, rotas, tela, presets embutidos (somente leitura, duplicáveis).
**Não inclui:** gerar arquivos no workspace (#{RT-07}), escolher perfil no nó (#{EDT-05}).

## Especificação técnica
### Arquivos
Criar:
- `src/shared/tool_profile_types.ts`
- `src/server/db/migrations/0300_tool_profiles.sql`
- `src/server/db/schema/tool_profiles.ts`
- `src/server/tool_profiles/tool_profile_presets.ts`
- `src/server/tool_profiles/tool_profile_repository.ts`
- `src/server/tool_profiles/tool_profile_service.ts`
- `src/server/tool_profiles/tool_profiles_routes.ts`
- `src/server/tool_profiles/tool_profile_service.test.ts`
- `src/web/app/settings/tool_profile_form.tsx`
- `src/web/app/settings/tool_profiles_page.test.tsx`
Alterar:
- `src/web/app/settings/tool_profiles_page.tsx` (substituir o placeholder)
- (o arquivo `*_routes.ts` desta issue já existe como stub criado em #{F-03}: substitua o conteúdo; **não** altere `src/server/route_modules.ts`)

### Contratos
```ts
import { PERMISSION_MODES } from "@/shared/agent_types"; // criado em #{FLW-01}
export const mcpServerSchema = z.object({
    name: z.string().regex(/^[a-z0-9_-]+$/),
    command: z.string().min(1), args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).default({}),   // valores podem referenciar credenciais: "${cred:<id>}"
});
export const toolProfileInput = z.object({
    name: z.string().trim().min(1).max(60), description: z.string().max(300).default(""),
    mcpServers: z.array(mcpServerSchema).default([]),
    allowedTools: z.array(z.string()).default([]),       // sintaxe de regra do Claude Code: "Read", "Bash(git log *)", "mcp__codegraph__*"
    disallowedTools: z.array(z.string()).default([]),
    permissionMode: z.enum(PERMISSION_MODES).default("bypassPermissions"),
    indexCodegraphOnStart: z.boolean().default(false),   // roda "codegraph init --yes" ao abrir o workspace
});
export interface ToolProfile extends z.infer<typeof toolProfileInput> { id: string; builtin: boolean; createdAt: string; updatedAt: string }
```
Presets (`builtin: true`, ids fixos): `tlp_builtin_codegraph` (MCP `codegraph` com `codegraph serve --mcp`,
`indexCodegraphOnStart: true`, `allowedTools` inclui `mcp__codegraph__*`), `tlp_builtin_readonly` (`disallowedTools:
["Write", "Edit", "NotebookEdit"]`, permissão `bypassPermissions` dentro do container) e `tlp_builtin_default` (vazio).
Rotas: `GET/POST /api/tool-profiles`, `GET/PUT/DELETE /api/tool-profiles/:id`, `POST /api/tool-profiles/:id/duplicate`.
Editar/remover preset → 409.

### Passo a passo
1. Tipos, migração, schema, repositório; presets em código (não no banco), mesclados na listagem.
2. Service com validação: nomes de MCP únicos no perfil; referências `${cred:<id>}` só para credenciais existentes (consulte o `CredentialService` se já existir; senão valide só o formato — #{RT-07} resolve).
3. Rotas.
4. Tela: lista de perfis (presets marcados "embutido"), formulário com lista editável de MCPs (nome, comando, args, env), listas de ferramentas como "chips" editáveis, seletor de modo de permissão com descrição de cada modo.

### Notas de design
O modo `bypassPermissions` mostra o aviso: "o agente pode executar qualquer comando dentro do container; o
container é a fronteira de segurança". Comandos e nomes de ferramentas em mono.

## Critérios de aceite
- [ ] Os três presets aparecem na lista e não podem ser editados nem removidos; podem ser duplicados.
- [ ] Criar perfil com dois MCPs de mesmo nome → 422.
- [ ] `permissionMode` inválido → 400.
- [ ] A tela cria, edita, duplica e remove perfis.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `tool_profile_service.test.ts`: presets, validação, duplicar, proteção de preset.
- `tool_profiles_page.test.tsx`: criar perfil com um MCP e duas ferramentas.
