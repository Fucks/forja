---
key: RT-07
title: "Aplicar perfil de ferramentas por nó: MCP, CodeGraph e permissões"
type: issue
milestone: "Fase 6 — Runtime de agentes"
labels: [tipo:feature, area:ferramentas]
depends_on: [RT-05, CFG-04, ENG-13]
---

## Contexto
Atende RF-CFG-02 e o objetivo de economizar tokens. Com o adaptador próprio (#{RT-02}), cada nó pode ter seu perfil de
ferramentas aplicado **por flags do CLI** — sem tocar em arquivos do repositório: `--mcp-config <arquivo> --strict-mcp-config`
(só os MCPs do perfil), `--allowedTools`/`--disallowedTools` e `--permission-mode`. O arquivo de MCP fica num diretório da
Forja montado no container, fora do worktree. O CodeGraph precisa indexar o worktree uma vez por workspace
(`codegraph init --yes`).

## Objetivo
O executor transforma o perfil de ferramentas do nó (ou do projeto) em `toolArgs`, arquivo de MCP, variáveis de ambiente e
comandos de setup, resolvendo referências a credenciais sem gravar segredos em arquivo.

## Escopo
**Inclui:** `materializeToolProfile`, diretório `~/.forja/runtime/<workspaceId>/` montado em `/home/agent/.forja` (somente leitura),
setup (`npm i` quando há `package.json`, `codegraph init --yes`), integração no executor e no `agent_executor`.
**Não inclui:** marketplace de MCPs.

## Especificação técnica
### Arquivos
Criar:
- `src/integrations/agent_runtime/tool_profile_materializer.ts`
- `src/integrations/agent_runtime/tool_profile_materializer.test.ts`
Alterar:
- `src/integrations/agent_runtime/docker_agent_runtime.ts` (montar o diretório de runtime do workspace)
- `src/server/runtime/executor.ts` (setup do workspace a partir do perfil do primeiro nó do item e do projeto)
- `src/server/runtime/executors/agent_executor.ts` (`toolArgs` e arquivo de MCP por nó)

### Contratos
```ts
export interface ToolProfileMaterialization {
    mcpConfigFile?: { hostPath: string; containerPath: string; content: string }; // /home/agent/.forja/mcp-<nodeId>.json
    toolArgs: string[];                       // ["--mcp-config", p, "--strict-mcp-config", "--allowedTools", "...", "--disallowedTools", "..."]
    permissionMode: PermissionMode;
    env: Record<string, string>;              // valores reais para os MCPs (vão pelo env do docker exec, #{RT-01})
    setupCommands: { command: string; timeoutMs: number }[];
}
export function materializeToolProfile(profile: ToolProfile, deps: { nodeId: string; runtimeDir: { host: string; container: string };
    credentialEnv(id: string): { envVar: string; value: string } | undefined; hasPackageJson: boolean }): ToolProfileMaterialization;
```
- MCP com `env` referenciando `${cred:<id>}` → no arquivo vira `${NOME_DA_VAR}` (expansão de env do Claude Code) e o valor real
  vai em `env`. Nenhum segredo no arquivo (teste lê o conteúdo).
- Perfil sem MCPs → `--strict-mcp-config` com um arquivo vazio `{ "mcpServers": {} }` (o agente não herda MCPs da imagem sem querer).
- `allowedTools`/`disallowedTools` vazios não geram flags.
- Setup do workspace: união dos perfis de todos os nós `agent` do fluxo que rodam no item (o CodeGraph indexa uma vez).
- Nós do mesmo item rodam um de cada vez no mesmo workspace, cada um com seu `--mcp-config` — não há disputa.

### Passo a passo
1. `materializeToolProfile` puro com testes (preset CodeGraph, só leitura, MCP com credencial, perfil vazio).
2. Diretório de runtime por workspace (criado no `openWorkspace`, removido no `close`).
3. Integração no executor e no `agent_executor`.

## Critérios de aceite
- [ ] Preset CodeGraph gera `--mcp-config` com o servidor `codegraph`, `--strict-mcp-config` e o setup `codegraph init --yes`.
- [ ] Perfil só leitura gera `--disallowedTools Write Edit NotebookEdit`.
- [ ] Nenhum arquivo gerado contém o valor de uma credencial; o valor vai no env.
- [ ] Nada é escrito no worktree do repositório.
- [ ] Dois nós do mesmo item com perfis diferentes recebem `toolArgs` diferentes.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `tool_profile_materializer.test.ts`; ajuste em `executor.test.ts` (setup e `toolArgs` repassados ao runtime).
