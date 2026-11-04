---
key: RT-06
title: "Imagem Docker do agente por projeto"
type: issue
milestone: "Fase 6 — Runtime Sandcastle"
labels: [tipo:feature, area:harness]
depends_on: [RT-01, CFG-03, CFG-05]
---

## Contexto
Atende RF-PRJ-02 e RF-CFG-03. Cada nó roda num container com Claude Code, git, gh e, opcionalmente, CodeGraph e
Playwright. O pipeline atual já tem um `Dockerfile` testado em produção (`.sandcastle/Dockerfile`: node 22, gh,
Playwright, `@colbymchenry/codegraph`, usuário `agent` com UID/GID do host, Claude Code via `install.sh`, MCP do
CodeGraph em escopo de usuário). A Forja embute esse Dockerfile como padrão, permite usar o Dockerfile do próprio
projeto, constrói a imagem e mostra o status no diagnóstico.

## Objetivo
O usuário vê, na configuração do projeto, se a imagem do agente existe, constrói com um clique (com log ao vivo) a
partir do Dockerfile padrão da Forja ou do `.sandcastle/Dockerfile` do projeto, e o diagnóstico acusa imagem ausente.

## Escopo
**Inclui:** Dockerfile padrão em `assets/agent-image/`, service de imagem (inspecionar, construir), rota com stream do
build, item no diagnóstico, botão na tela do projeto.
**Não inclui:** registro remoto de imagens.

## Especificação técnica
### Arquivos
Criar:
- `assets/agent-image/Dockerfile`
- `src/server/agent_images/agent_image_service.ts`
- `src/server/agent_images/agent_image_service.test.ts`
- `src/web/app/projects/agent_image_panel.tsx`
Alterar:
- `src/server/agent_images/agent_images_routes.ts` (substituir o stub de #{F-03})
- `src/server/diagnostics/diagnostic_checks.ts` (item "imagem do agente" por projeto: `docker image inspect <imagem>`)
- `src/web/app/projects/project_settings_page.tsx` (seção "Container" usa o painel)

### Contratos
```ts
export interface AgentImageStatus { image: string; exists: boolean; createdAt?: string; sizeMb?: number; source: "forja_default" | "project_dockerfile" }
export interface AgentImageService {
    status(projectId: string): Promise<AgentImageStatus>;
    build(projectId: string, onLine: (line: string) => void, signal: AbortSignal): Promise<{ ok: boolean; exitCode: number }>;
}
```
- Fonte: se o projeto tem `.sandcastle/Dockerfile`, usa-o (`source: project_dockerfile`); senão `assets/agent-image/Dockerfile`.
- Build: `docker build -t <imagem> --build-arg AGENT_UID=<uid> --build-arg AGENT_GID=<gid> -f <dockerfile> <contexto>` via
  `CommandRunner` com timeout de 30 min (no Windows, UID/GID = 1000). Linhas pelo `onLine`.
- Rotas: `GET /api/projects/:id/agent-image`, `POST /api/projects/:id/agent-image/build` (resposta SSE com as linhas e um evento final `done`).
- `assets/agent-image/Dockerfile`: copie `.sandcastle/Dockerfile` deste repositório, com Playwright opcional via
  `ARG INSTALL_PLAYWRIGHT=false`, e mantenha o MCP do CodeGraph e o trust do workspace.

### Passo a passo
1. Dockerfile padrão.
2. Service com `CommandRunner` (fake nos testes).
3. Rotas, item de diagnóstico e painel (status + "Construir imagem" + log ao vivo com `LogViewer` de #{DS-06}).

### Notas de design
O painel mostra o status como `StatusBadge` (sucesso/falha) com o nome da imagem em mono; durante o build o botão vira
"Cancelar" e o log aparece abaixo, seguindo o fim.

## Critérios de aceite
- [ ] Sem imagem, o diagnóstico mostra erro "Imagem forja-agent:latest não encontrada" com o fix "Construir imagem".
- [ ] Projeto com `.sandcastle/Dockerfile` usa esse arquivo; sem ele, usa o padrão da Forja.
- [ ] O build envia as linhas ao vivo e termina com o status atualizado.
- [ ] Cancelar o build aborta o comando.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `agent_image_service.test.ts` (FakeCommandRunner): escolha do Dockerfile, argumentos do build, status, cancelamento.
