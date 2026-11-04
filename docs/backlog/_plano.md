# Plano do backlog — Forja

Fonte de verdade de chaves, dependências e nomes de arquivos. 87 issues de agente + 6 tarefas humanas + PRD.

## Convenções que todas as issues seguem

- Migrações SQL por domínio em `src/server/db/migrations/<NNNN>_<dominio>.sql` (aplicadas em ordem pelo
  `migrate.ts`; sem journal compartilhado) e tabelas Drizzle em `src/server/db/schema/<dominio>.ts`
  (importadas diretamente, sem `index.ts`). Faixas: 0100 projetos · 0200 credenciais · 0300 perfis de ferramentas ·
  0400 configurações · 0500 fluxos · 0600 runs · 0610 índice de logs · 0650 uso · 0700 itens · 0800 gatilhos ·
  0900 aprovações · 0950 auditoria.
- `src/shared/events.ts` é criado em F-06 com **todos** os eventos do MVP.
- `src/shared/flow_graph.ts` + `src/shared/node_configs/<tipo>.ts` são criados em FLW-01 com **todos** os tipos de nó.
- Executores de nó: `src/server/runtime/node_executors.ts` — cadeia ENG-10 → ENG-13 → BRD-04 → GIT-01 → GIT-03.
- Componentes de nó: `src/web/canvas/nodes/node_components.ts` (EDT-02, todos os tipos). Inspectors:
  `src/web/canvas/inspector/inspector_registry.ts` — cadeia EDT-05 → EDT-06.
- **Dependências npm**: todas instaladas em F-01. Issues não editam `package.json` (exceto scripts: F-02, F-03, F-04, QA-01, QA-02, QA-05, em cadeia).
- **Rotas do servidor**: `src/server/route_modules.ts` é uma lista fechada criada em F-03 com um **stub** por domínio;
  a issue dona substitui o conteúdo do seu `*_routes.ts` e nunca edita `route_modules.ts`.
- **Tarefas em segundo plano** (sync, cron, limpeza) iniciam no módulo de rotas do domínio via `app.addHook("onReady")`
  e param em `onClose` — ninguém edita `main.ts` para isso.
- **`AppDeps`** (`app.ts`/`main.ts`) só cresce em: F-05, F-06, F-09, PRJ-01, CFG-02, ENG-10, ENG-11, RT-03, OBS-06, QA-03 — todas em cadeia.
- **Páginas da SPA**: DS-04 cria um placeholder em cada caminho final (`src/web/app/<area>/<x>_page.tsx`); a issue de
  tela substitui só o seu arquivo e nunca edita `routes.tsx`. Navegação em `src/web/config/navigation.ts`.
- **Arquivos de runtime não-TS** (migrações, prompts `.md`, `assets/`): copiados pelo `tsup.config.ts` de F-04 e lidos com `runtimeAssetPath`.
- **Tipos compartilhados de agente** (`Effort`, `PermissionMode`) e `ValidationIssue`: em `src/shared/`, criados em FLW-01.
- `src/engine/scheduler.ts`: cadeia ENG-03 → ENG-04 → ENG-05 → ENG-06 → ENG-07 → ENG-08 → ENG-10 → ENG-11 → GIT-03.
- `src/server/runtime/executor.ts`: cadeia ENG-10 → ENG-11 → RT-03 → RT-05 → RT-07 → RT-08 → GIT-03.
- Editor (`flow_canvas.tsx`): cadeia EDT-01 → … → EDT-09 → OBS-01.
- Checagem de conflitos: nenhum par de issues sem relação de dependência altera o mesmo arquivo listado (verificado por script na criação do backlog).

## Tabela

| Chave | Título | Fase | depends_on | Arquivos principais |
|---|---|---|---|---|
| F-01 | Configurar projeto TypeScript, scripts npm e Vitest | 0 | — | tsconfig.json, src/lib/assert_never.ts, package.json |
| F-02 | Configurar ESLint e Prettier com os padrões do projeto | 0 | F-01 | eslint.config.mjs, .prettierrc.json, .prettierignore |
| F-03 | Servidor Fastify, CLI forja e diretório de dados | 0 | F-02 | src/lib/env.ts, src/lib/paths.ts, src/server/app.ts |
| F-04 | SPA React + Vite + Tailwind servida pelo servidor | 0 | F-03 | vite.config.ts, index.html, src/web/main.tsx |
| F-05 | SQLite com Drizzle e migrador por domínio | 0 | F-04 | src/server/db/client.ts, src/server/db/migrate.ts, src/server/db/migrations/0001_init.sql |
| F-06 | EventBus tipado e stream SSE /api/events | 0 | F-03, F-05 | src/shared/events.ts, src/server/runtime/event_bus.ts, src/server/events/events_routes.ts |
| F-07 | Relógio, ids e formatadores compartilhados | 0 | F-01 | src/lib/clock.ts, src/lib/ids.ts, src/lib/format.ts |
| F-08 | CI no GitHub Actions (Ubuntu e Windows) | 0 | F-02 | .github/workflows/ci.yml, .gitattributes |
| F-09 | Cliente da API e hook de eventos no front | 0 | F-04, F-06 | src/shared/api_types.ts, src/web/api/api_client.ts, src/web/api/query_client.ts |
| DS-01 | Tokens de design, fontes e tema Tailwind | 1 | F-09 | src/web/styles/tokens.css, src/web/styles/theme.ts, src/web/styles/global.css |
| DS-02 | Componentes de formulário do design system | 1 | DS-01 | src/web/components/ui/cn.ts, src/web/components/ui/button.tsx, src/web/components/ui/icon_button.tsx |
| DS-03 | Componentes de feedback, overlay e StatusBadge | 1 | DS-01 | src/web/components/ui/execution_status.ts, src/web/components/ui/status_badge.tsx, src/web/components/ui/dialog.tsx |
| DS-04 | App shell, rotas, navegação e /styleguide | 1 | DS-02, DS-03 | src/web/config/navigation.ts, src/web/app/app_shell.tsx, src/web/app/sidebar.tsx |
| DS-05 | Base visual do canvas: nó, portas, moldura de grupo e arestas | 1 | DS-03, DS-04 | src/web/canvas/base/base_node.tsx, src/web/canvas/base/port_handle.tsx, src/web/canvas/base/group_frame.tsx |
| DS-06 | LogViewer virtualizado (componente base) | 1 | DS-03, DS-04 | src/web/logs/log_types.ts, src/web/logs/log_viewer.tsx, src/web/logs/log_line.tsx |
| PRJ-01 | Cadastrar projeto a partir de um repositório git local | 2 | F-05, F-06, F-07, F-09 | src/integrations/process/command_runner.ts, src/integrations/process/execa_command_runner.ts, src/integrations/git/git_provider.ts |
| PRJ-02 | Telas de projetos: lista, criação e visão geral | 2 | PRJ-01, DS-04, F-09 | src/web/app/projects/use_projects.ts, src/web/app/projects/new_project_dialog.tsx, src/web/app/projects/projects_page.tsx |
| CFG-01 | Cofre de segredos (AES-256-GCM) e redator de logs | 2 | F-05 | src/integrations/secrets/secret_box.ts, src/integrations/secrets/master_key.ts, src/integrations/secrets/secret_redactor.ts |
| CFG-02 | Credenciais: API e tela | 2 | CFG-01, PRJ-01, DS-04, F-09 | src/shared/credential_types.ts, src/server/db/migrations/0200_credentials.sql, src/server/db/schema/credentials.ts |
| CFG-03 | Diagnóstico do ambiente: Docker, git, gh, Node e Sandcastle | 2 | PRJ-01, DS-04, F-09 | src/shared/diagnostic_types.ts, src/server/diagnostics/diagnostic_checks.ts, src/server/diagnostics/diagnostic_service.ts |
| CFG-04 | Perfis de ferramentas: MCP, CodeGraph e permissões | 2 | PRJ-01, FLW-01, DS-04, F-09 | src/shared/tool_profile_types.ts, src/server/db/migrations/0300_tool_profiles.sql, src/server/db/schema/tool_profiles.ts |
| CFG-05 | Configurações do projeto e globais | 2 | PRJ-02, CFG-02, CFG-04, FLW-01 | src/shared/settings_types.ts, src/server/db/migrations/0400_settings.sql, src/server/db/schema/settings.ts |
| FLW-01 | Contrato FlowGraph e configs de todos os tipos de nó | 3 | F-01 | src/shared/flow_graph.ts, src/shared/conditions.ts, src/shared/node_configs/trigger_config.ts |
| FLW-02 | Validação do grafo do fluxo | 3 | FLW-01 | src/engine/graph_queries.ts, src/engine/graph_validation.ts |
| FLW-03 | Template de prompt com variáveis das portas | 3 | FLW-01 | src/engine/prompt_template.ts |
| FLW-04 | Fluxos e versões: persistência e API | 3 | FLW-02, FLW-03, PRJ-01 | src/shared/flow_types.ts, src/server/db/migrations/0500_flows.sql, src/server/db/schema/flows.ts |
| FLW-05 | Exportar e importar fluxo em YAML | 3 | FLW-04 | src/server/flows/flow_yaml.ts, src/server/flows/flows_routes.ts |
| FLW-06 | Templates de fluxo embutidos | 3 | FLW-05 | src/server/flows/templates/flow_template_registry.ts, src/server/flows/templates/basic_factory.ts, src/server/flows/templates/review_loop.ts |
| EDT-01 | Canvas do editor carregando e salvando o rascunho | 4 | DS-05, FLW-04, F-09 | src/web/canvas/graph_mapping.ts, src/web/canvas/editor_store.ts, src/web/canvas/flow_canvas.tsx |
| EDT-02 | Nós customizados por tipo no canvas | 4 | EDT-01 | src/web/canvas/nodes/node_summary.ts, src/web/canvas/nodes/agent_node.tsx, src/web/canvas/nodes/simple_nodes.tsx |
| EDT-03 | Paleta de nós: arrastar para criar | 4 | EDT-02 | src/web/canvas/palette/palette_items.ts, src/web/canvas/palette/node_palette.tsx, src/web/canvas/palette/drop_target.ts |
| EDT-04 | Conectar portas com validação de tipo | 4 | EDT-03 | src/web/canvas/connection_rules.ts, src/web/canvas/edge_actions.ts, src/web/canvas/flow_canvas.tsx |
| EDT-05 | Inspector do nó agente: prompt, modelo, effort e ferramentas | 4 | EDT-04, FLW-03, CFG-04, CFG-05 | src/web/canvas/inspector/inspector_panel.tsx, src/web/canvas/inspector/inspector_registry.ts, src/web/canvas/inspector/agent_inspector.tsx |
| EDT-06 | Inspector dos demais tipos de nó | 4 | EDT-05 | src/web/canvas/inspector/trigger_inspector.tsx, src/web/canvas/inspector/source_inspector.tsx, src/web/canvas/inspector/script_inspector.tsx |
| EDT-07 | Agrupar seleção em loop ou map no canvas | 4 | EDT-06 | src/web/canvas/grouping.ts, src/web/canvas/selection_toolbar.tsx, src/web/canvas/inspector/group_inspector.tsx |
| EDT-08 | Erros de validação no canvas e publicação de versão | 4 | EDT-07 | src/web/canvas/use_validation.ts, src/web/canvas/validation_overlay.tsx, src/web/canvas/problems_panel.tsx |
| EDT-09 | Desfazer/refazer, copiar/colar, atalhos e auto-layout | 4 | EDT-08 | src/web/canvas/history.ts, src/web/canvas/clipboard.ts, src/web/canvas/shortcuts.ts |
| EDT-10 | Versões do fluxo: lista, diff e restaurar | 4 | EDT-09 | src/engine/graph_diff.ts, src/web/app/flows/version_diff_view.tsx, src/web/app/flows/versions_page.tsx |
| EDT-11 | Lista de fluxos: novo a partir de template, importar e exportar | 4 | EDT-10, FLW-06 | src/web/app/flows/use_flows.ts, src/web/app/flows/new_flow_dialog.tsx, src/web/app/flows/import_flow_button.tsx |
| ENG-01 | Contrato AgentRuntime e FakeAgentRuntime roteirizável | 5 | FLW-01, F-07 | src/integrations/agent_runtime/agent_runtime.ts, src/integrations/agent_runtime/agent_errors.ts |
| ENG-02 | Máquinas de estado de Run e NodeRun | 5 | FLW-01 | src/engine/run_state.ts, src/engine/node_run_state.ts |
| ENG-03 | Scheduler de DAG por item com concorrência global | 5 | ENG-02, FLW-02 | src/engine/scheduler_types.ts, src/engine/scheduler.ts |
| ENG-04 | Executar grupo map com concorrência configurável | 5 | ENG-03 | src/engine/map_group.ts, src/engine/scheduler.ts |
| ENG-05 | Executar grupo loop com condição de saída e teto | 5 | ENG-04 | src/engine/loop_group.ts, src/engine/scheduler.ts |
| ENG-06 | Retentativas, timeouts e cancelamento de NodeRuns | 5 | ENG-05, ENG-01 | src/engine/retry_policy.ts, src/engine/run_state.ts, src/engine/scheduler_types.ts |
| ENG-07 | Orçamentos de tokens e custo por run, nó e dia | 5 | ENG-06 | src/engine/budgets.ts, src/engine/scheduler_types.ts, src/engine/scheduler.ts |
| ENG-08 | Pausa e retomada automática por limite de uso | 5 | ENG-07 | src/engine/usage_pause.ts, src/engine/scheduler_types.ts, src/engine/scheduler.ts |
| ENG-09 | Persistência de runs, NodeRuns, artefatos e snapshot do scheduler | 5 | F-05, ENG-02 | src/server/db/migrations/0600_runs.sql, src/server/db/schema/runs.ts, src/server/runs/run_repository.ts |
| ENG-10 | Executor: liga motor, runtime de agente, banco e eventos | 5 | ENG-08, ENG-09, F-06, FLW-04, PRJ-01, CFG-05, BRD-01 | src/server/runtime/executor.ts, src/server/runtime/node_executors.ts, src/server/runtime/executors/agent_executor.ts |
| ENG-11 | Recuperação de runs após reinício do servidor | 5 | ENG-10 | src/server/runtime/recovery.ts, src/engine/scheduler_types.ts, src/server/runtime/executor.ts |
| ENG-12 | API de runs: iniciar, pausar, retomar, cancelar e repetir | 5 | ENG-11 | src/shared/run_types.ts, src/server/runs/run_service.ts, src/server/runs/run_view.ts |
| ENG-13 | Executores dos nós trigger, script, condition e output | 5 | ENG-12 | src/server/runtime/executors/trigger_executor.ts, src/server/runtime/executors/script_executor.ts, src/server/runtime/executors/condition_executor.ts |
| RT-01 | SandcastleAgentRuntime: workspace Docker por item | 6 | ENG-01 | src/integrations/agent_runtime/sandcastle_api.ts, src/integrations/agent_runtime/sandcastle_agent_runtime.ts |
| RT-02 | Executar nó agente no Sandcastle com effort, saída estruturada e eventos | 6 | RT-01, RT-04 | src/integrations/agent_runtime/run_agent_node.ts, src/integrations/agent_runtime/agent_event_mapper.ts, src/integrations/agent_runtime/output_schema.ts |
| RT-03 | Log store NDJSON por NodeRun com redação de segredos | 6 | RT-02, CFG-02, ENG-12 | src/shared/log_types.ts, src/server/runtime/log_store.ts, src/server/db/migrations/0610_log_index.sql |
| RT-04 | Parser de mensagens de limite de uso do Claude Code | 6 | ENG-01 | src/integrations/agent_runtime/usage_limit_parser.ts |
| RT-05 | Registro de uso de tokens e custo estimado | 6 | RT-03, CFG-05 | src/shared/usage_types.ts, src/server/db/migrations/0650_usage.sql, src/server/db/schema/usage.ts |
| RT-06 | Imagem Docker do agente por projeto | 6 | RT-01, CFG-03, CFG-05 | assets/agent-image/Dockerfile, src/server/agent_images/agent_image_service.ts, src/web/app/projects/agent_image_panel.tsx |
| RT-07 | Aplicar perfil de ferramentas (MCP, CodeGraph) no workspace | 6 | RT-05, CFG-04, ENG-13 | src/integrations/agent_runtime/tool_profile_files.ts, src/server/runtime/executor.ts, src/server/runtime/executors/agent_executor.ts |
| RT-08 | Credenciais no runtime e teste de credencial | 6 | RT-07, CFG-02 | src/integrations/agent_runtime/agent_env.ts, src/server/credentials/credential_check.ts, src/server/runtime/executor.ts |
| OBS-01 | Execução ao vivo no canvas | 7 | EDT-09, ENG-12 | src/web/canvas/live/run_view_model.ts, src/web/canvas/live/use_live_run.ts, src/web/canvas/live/run_canvas.tsx |
| OBS-02 | Drawer do nó com NodeRuns, entradas e saídas | 7 | OBS-01 | src/web/canvas/live/node_run_drawer.tsx, src/web/canvas/live/node_run_list.tsx, src/web/canvas/live/node_run_detail.tsx |
| OBS-03 | Logs em streaming no drawer do nó | 7 | OBS-02, DS-06, RT-03 | src/web/logs/use_node_run_logs.ts, src/web/logs/to_log_lines.ts, src/web/logs/event_renderers.tsx |
| OBS-04 | Histórico de runs | 7 | OBS-01 | src/web/app/runs/use_runs.ts, src/web/app/runs/runs_table.tsx, src/web/app/runs/new_run_dialog.tsx |
| OBS-05 | Painel de uso de tokens e custo | 7 | RT-05, OBS-03 | src/web/app/usage/use_usage.ts, src/web/app/usage/usage_chart.tsx, src/web/app/usage/usage_table.tsx |
| OBS-06 | Modo demo: runtime roteirizado e --seed-demo | 7 | OBS-03, FLW-06, RT-05, BRD-04 | src/integrations/agent_runtime/scripted_agent_runtime.ts, src/server/demo/seed_demo.ts, src/server/demo/demo_script.ts |
| BRD-01 | Itens de trabalho e itens locais | 8 | PRJ-01 | src/shared/work_item_types.ts, src/server/db/migrations/0700_work_items.sql, src/server/db/schema/work_items.ts |
| BRD-02 | GitHubProvider via gh: issues, dependências e PRs | 8 | PRJ-01 | src/integrations/github/github_provider.ts, src/integrations/github/gh_cli_github_provider.ts, src/integrations/github/blocked_by_parser.ts |
| BRD-03 | Sincronizar issues do GitHub com os itens de trabalho | 8 | BRD-01, BRD-02, CFG-05 | src/server/work_items/github_sync.ts, src/server/work_items/sync_scheduler.ts, src/server/work_items/work_items_routes.ts |
| BRD-04 | Nó source: buscar itens respeitando dependências | 8 | BRD-03, ENG-13 | src/server/runtime/executors/source_executor.ts, src/server/runtime/executors/select_source_items.ts, src/server/runtime/node_executors.ts |
| BRD-05 | Board kanban com colunas derivadas do fluxo | 8 | BRD-04, ENG-12, DS-04 | src/engine/board_columns.ts, src/server/work_items/board_service.ts, src/web/board/board_view.tsx |
| BRD-06 | Detalhe do item de trabalho com linha do tempo | 8 | BRD-05, OBS-02 | src/web/board/work_item_drawer.tsx, src/web/board/item_timeline.tsx, src/server/work_items/item_timeline.ts |
| BRD-07 | Criar item local e soltar card em coluna-gatilho | 8 | BRD-06, TRG-01 | src/web/board/new_item_dialog.tsx, src/web/board/board_dnd.tsx, src/web/board/drop_rules.ts |
| TRG-01 | Gatilhos: modelo, políticas e disparo manual | 9 | ENG-12, BRD-01 | src/shared/trigger_types.ts, src/server/db/migrations/0800_triggers.sql, src/server/db/schema/triggers.ts |
| TRG-02 | Gatilho cron com fuso e próximo disparo | 9 | TRG-01 | src/engine/cron_schedule.ts, src/server/triggers/cron_runner.ts, src/server/triggers/triggers_routes.ts |
| TRG-03 | Gatilhos por evento (incluindo limite resetado) e webhook local | 9 | TRG-02, ENG-08 | src/server/triggers/event_trigger_listener.ts, src/server/triggers/webhook_tokens.ts, src/server/triggers/webhook_routes.ts |
| TRG-04 | Tela de gatilhos e pausa global | 9 | TRG-03, BRD-05 | src/web/app/triggers/use_triggers.ts, src/web/app/triggers/trigger_form.tsx, src/web/app/triggers/cron_presets.ts |
| GIT-01 | Nó git: rebase, push e abertura de PR | 10 | BRD-04, RT-08 | src/server/runtime/executors/git_executor.ts, src/server/runtime/executors/prompts/rebase.md, src/server/runtime/executors/pr_title.ts |
| GIT-02 | Sincronizar PR mesclado: fechar issue, mover card e limpar branch | 10 | GIT-01, BRD-06 | src/server/work_items/pull_request_sync.ts, src/server/work_items/work_items_routes.ts, src/server/runtime/executors/output_executor.ts |
| GIT-03 | Nó gate e aprovações humanas (backend) | 10 | GIT-01 | src/shared/approval_types.ts, src/server/db/migrations/0900_approvals.sql, src/server/db/schema/approvals.ts |
| GIT-04 | Tela de aprovações com diff e artefatos | 10 | GIT-03, OBS-05, TRG-04 | src/web/app/approvals/use_approvals.ts, src/web/app/approvals/diff_viewer.tsx, src/web/app/approvals/parse_unified_diff.ts |
| GIT-05 | Template "Pipeline Sandcastle" de ponta a ponta | 10 | GIT-03, GIT-02, FLW-06 | src/server/flows/templates/sandcastle_pipeline.ts, src/server/flows/templates/prompts/sandcastle_implement.md, src/server/flows/templates/prompts/sandcastle_review.md |
| QA-01 | E2E do ciclo central com Playwright | 11 | OBS-06, BRD-07, EDT-11, GIT-04, F-08 | playwright.config.ts, e2e/fixtures.ts, e2e/project_and_flow.spec.ts |
| QA-02 | Desempenho do canvas, dos logs e do motor | 11 | QA-01 | package.json |
| QA-03 | Endurecimento de segurança local e auditoria | 11 | RT-08, GIT-04, OBS-04 | src/server/security/session_token.ts, src/server/security/request_guard.ts, src/server/db/migrations/0950_audit_log.sql |
| QA-04 | Retenção e limpeza de logs e workspaces | 11 | GIT-02, RT-06, OBS-03 | src/server/maintenance/plan_cleanup.ts, src/server/maintenance/cleanup_service.ts, src/server/runs/logs_routes.ts |
| QA-05 | Empacotamento npm, docker-compose opcional e README | 11 | QA-02, QA-03, QA-04, GIT-05 | README.md, docker-compose.yml, Dockerfile.server |
| HUM-01 | Definir nome do pacote npm e checar a marca Forja | 11 | — | (humano) |
| HUM-02 | Gravar fixtures reais de eventos do Sandcastle e de limite de uso | 6 | — | (humano) |
| HUM-03 | Validar MCP e permissões por run no Sandcastle | 6 | — | (humano) |
| HUM-04 | Preparar a máquina: Docker Desktop, credencial, preços e imagem do agente | 6 | — | (humano) |
| HUM-05 | Medir a economia de tokens com CodeGraph | 11 | — | (humano) |
| HUM-06 | Teste de aceitação com 3 issues reais | 11 | — | (humano) |

## Ciclo central e paralelismo

- Após F-01: F-02, F-07 e FLW-01 desbloqueadas (F-03 → F-04 → F-05 seguem em cadeia por mexerem em scripts e no build). Após FLW-01: FLW-02, FLW-03, ENG-02 (e ENG-01 com F-07).
- Ciclo central com fake: FLW-01 → ENG-01..ENG-10 → ENG-12 → OBS-01/OBS-03 → OBS-06 (demo).
- O runtime real (RT-*) anda em paralelo ao motor a partir de ENG-01.
