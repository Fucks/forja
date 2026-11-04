---
key: RT-07
title: "Aplicar perfil de ferramentas (MCP, CodeGraph) no workspace"
type: issue
milestone: "Fase 6 — Runtime Sandcastle"
labels: [tipo:feature, area:ferramentas]
depends_on: [RT-05, CFG-04, ENG-13]
---

## Contexto
Atende RF-CFG-02 e o objetivo de economizar tokens. O Sandcastle 0.12 não recebe `--mcp-config`/`--allowedTools` por
run; a forma suportada pelo Claude Code é ler `.mcp.json` e `.claude/settings.json` do diretório de trabalho. Como cada
item tem seu worktree, a Forja escreve esses arquivos ao abrir o workspace (`WorkspaceSpec.files`, #{ENG-01}) e
roda `codegraph init --yes` no setup quando o perfil pede. A validação dessa estratégia com o CLI real é a tarefa
#{HUM-03}.

## Objetivo
O executor monta, a partir do perfil de ferramentas do nó (ou do projeto), os arquivos `.mcp.json` e
`.claude/settings.local.json` e os comandos de setup do workspace, resolvendo referências a credenciais, sem nunca gravar
segredos em arquivo.

## Escopo
**Inclui:** `buildToolProfileFiles`, comandos de setup (`npm i` quando há `package.json`, `codegraph init --yes`), resolução
de `${cred:<id>}` para **nomes de variáveis de ambiente**, integração no executor, ignorar esses arquivos no git do worktree.
**Não inclui:** perfis diferentes para nós do mesmo item rodando **em sequência** com arquivos diferentes — veja a semântica.

## Especificação técnica
### Arquivos
Criar:
- `src/integrations/agent_runtime/tool_profile_files.ts`
- `src/integrations/agent_runtime/tool_profile_files.test.ts`
Alterar:
- `src/server/runtime/executor.ts` (spec do workspace com arquivos e setup)
- `src/server/runtime/executors/agent_executor.ts` (reescrever arquivos antes de cada agente quando o perfil do nó difere do anterior)
- `src/integrations/agent_runtime/agent_runtime.ts` (método `Workspace.writeFiles(files)`)
- `src/integrations/agent_runtime/sandcastle_agent_runtime.ts`
- `src/test/fakes/fake_agent_runtime.ts`

### Contratos
```ts
export interface ToolProfileMaterialization {
    files: { path: string; content: string }[];          // ".mcp.json", ".claude/settings.local.json"
    env: Record<string, string>;                          // variáveis que os MCPs precisam (valores reais, via env do container)
    setupCommands: { command: string; timeoutMs: number }[];
}
export function materializeToolProfile(profile: ToolProfile, deps: { credentialEnv(id: string): { envVar: string; value: string } | undefined; hasPackageJson: boolean }): ToolProfileMaterialization;
```
- `.mcp.json`: `{ "mcpServers": { "<nome>": { "command", "args", "env": { "X": "${X}" } } } }` — valores de credencial
  viram referência `${VAR}` (expansão de env do Claude Code) e o valor real vai em `env` do container.
- `.claude/settings.local.json`: `{ "permissions": { "allow": [...allowedTools], "deny": [...disallowedTools] }, "enableAllProjectMcpServers": true }`.
- Os dois arquivos são adicionados a `.git/info/exclude` do worktree (via `exec`) para nunca entrarem em commit.
- Setup: `npm i` (se `package.json`), `codegraph init --yes` (se `indexCodegraphOnStart`), timeouts 10 min/5 min.
- Nós do mesmo item com perfis diferentes: antes de cada agente, `writeFiles` com o perfil do nó (os agentes do mesmo
  item rodam um de cada vez no mesmo workspace, então não há disputa).

### Passo a passo
1. `materializeToolProfile` puro com testes (preset CodeGraph, perfil só leitura, MCP com credencial).
2. `Workspace.writeFiles` no contrato, no runtime real e no fake.
3. Integração no executor e no `agent_executor`.

## Critérios de aceite
- [ ] Preset CodeGraph gera `.mcp.json` com o servidor `codegraph` e o setup `codegraph init --yes`.
- [ ] Perfil só leitura gera `deny` com `Write`, `Edit`, `NotebookEdit`.
- [ ] Nenhum arquivo gerado contém o valor de uma credencial (só `${VAR}`); o valor vai no env.
- [ ] Os arquivos ficam fora do git do worktree.
- [ ] Trocar de perfil entre nós do mesmo item reescreve os arquivos antes do agente seguinte.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `tool_profile_files.test.ts`: casos acima.
- Ajuste em `executor.test.ts`: spec do workspace contém os arquivos e o setup.
