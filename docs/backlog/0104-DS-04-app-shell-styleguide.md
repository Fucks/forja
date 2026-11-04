---
key: DS-04
title: "App shell, rotas, navegação e /styleguide"
type: issue
milestone: "Fase 1 — Design system"
labels: [tipo:design, area:design-system]
depends_on: [DS-02, DS-03]
---

## Contexto
Toda tela vive dentro de um shell: barra lateral com os projetos e as áreas do projeto ativo (Fluxos, Board, Runs,
Uso, Gatilhos, Aprovações, Configurações) e topbar com o projeto ativo e o estado da conexão ao vivo. Navegação em
arquivo de dados evita que cada issue de tela edite o mesmo componente.

## Objetivo
Existe o `AppShell` com navegação vinda de `navigation.ts`, rotas aninhadas por projeto e a página `/styleguide`
com todos os componentes de #{DS-02} e #{DS-03} em todos os estados.

## Escopo
**Inclui:** shell, rotas placeholder por área, `navigation.ts`, troca de tema, `/styleguide`, página 404.
**Não inclui:** conteúdo real das áreas (cada fase traz o seu).

## Especificação técnica
### Arquivos
Criar:
- `src/web/config/navigation.ts`
- `src/web/app/app_shell.tsx`
- `src/web/app/sidebar.tsx`
- `src/web/app/topbar.tsx`
- `src/web/app/placeholder_page.tsx`
- `src/web/app/not_found_page.tsx`
- `src/web/app/styleguide_page.tsx`
- `src/web/app/app_shell.test.tsx`
- Um arquivo de página **placeholder** em cada caminho final (cada um exporta um componente que renderiza
  `PlaceholderPage` com o título da área). As issues de tela **substituem o conteúdo do seu arquivo** e nunca
  editam `routes.tsx`:

| Rota | Arquivo (export) | Issue que implementa |
|---|---|---|
| `/` | `src/web/app/projects/projects_page.tsx` (`ProjectsPage`) | #{PRJ-02} |
| `/projects/:projectId` | `src/web/app/projects/project_page.tsx` (`ProjectPage`) | #{PRJ-02} |
| `/projects/:projectId/settings` | `src/web/app/projects/project_settings_page.tsx` (`ProjectSettingsPage`) | #{CFG-05} |
| `/projects/:projectId/flows` | `src/web/app/flows/flows_page.tsx` (`FlowsPage`) | #{EDT-11} |
| `/projects/:projectId/flows/:flowId` | `src/web/app/flows/flow_editor_page.tsx` (`FlowEditorPage`) | #{EDT-01} |
| `/projects/:projectId/flows/:flowId/versions` | `src/web/app/flows/versions_page.tsx` (`VersionsPage`) | #{EDT-10} |
| `/projects/:projectId/board` | `src/web/app/board/board_page.tsx` (`BoardPage`) | #{BRD-05} |
| `/projects/:projectId/runs` | `src/web/app/runs/runs_page.tsx` (`RunsPage`) | #{OBS-04} |
| `/projects/:projectId/runs/:runId` | `src/web/app/runs/run_page.tsx` (`RunPage`) | #{OBS-01} |
| `/projects/:projectId/usage` | `src/web/app/usage/usage_page.tsx` (`UsagePage`) | #{OBS-05} |
| `/projects/:projectId/triggers` | `src/web/app/triggers/triggers_page.tsx` (`TriggersPage`) | #{TRG-04} |
| `/projects/:projectId/approvals` | `src/web/app/approvals/approvals_page.tsx` (`ApprovalsPage`) | #{GIT-04} |
| `/settings/credentials` | `src/web/app/settings/credentials_page.tsx` (`CredentialsPage`) | #{CFG-02} |
| `/settings/tool-profiles` | `src/web/app/settings/tool_profiles_page.tsx` (`ToolProfilesPage`) | #{CFG-04} |
| `/settings/diagnostics` | `src/web/app/settings/diagnostics_page.tsx` (`DiagnosticsPage`) | #{CFG-03} |

Alterar:
- `src/web/app/routes.tsx` (todas as rotas acima, `/styleguide` e `*`)
Remover:
- `src/web/app/home_page.tsx` e seu teste (substituídos por `ProjectsPage`)

### Contratos
```ts
export interface NavItem { id: string; label: string; icon: LucideIcon; path: (projectId: string) => string }
export const PROJECT_NAV: NavItem[]; // flows, board, runs, usage, triggers, approvals, settings
export const GLOBAL_NAV: { id: string; label: string; icon: LucideIcon; path: string }[]; // projetos, credenciais, ferramentas, diagnóstico
```
`/styleguide` e `/styleguide/canvas` (este último entra em #{DS-05}, que cria o arquivo e a rota) e `*` → 404.

### Passo a passo
1. Escreva `navigation.ts` e os placeholders da tabela.
2. `AppShell`: sidebar (240 px, recolhível para 56 px), topbar (44 px) com nome do projeto, indicador "ao vivo" (bolinha com rótulo, alimentado por `useEventStream` de #{F-09} quando disponível — aqui só a prop `connected`) e alternância de tema.
3. `/styleguide`: seções por componente, todos os estados (incluindo cada `StatusBadge`), nos dois temas.

### Notas de design
Sidebar em `--color-surface` com item ativo marcado por barra de 2 px em `--color-accent` à esquerda (não fundo
colorido). Títulos de página em IBM Plex Sans Condensed 600, 20 px. Layout desktop ≥ 1024 px; abaixo disso a
sidebar recolhe.

## Critérios de aceite
- [ ] Todas as rotas listadas renderizam dentro do shell; rota desconhecida mostra a 404.
- [ ] A navegação vem de `navigation.ts`; o item da rota atual fica marcado com `aria-current="page"`.
- [ ] `/styleguide` mostra todos os componentes e todos os estados de execução.
- [ ] Sidebar recolhida mantém ícones com tooltip e nome acessível.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `app_shell.test.tsx`: renderiza rota de projeto com item ativo; recolher a sidebar; 404.
