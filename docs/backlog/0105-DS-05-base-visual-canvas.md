---
key: DS-05
title: "Base visual do canvas: nó, portas, moldura de grupo e arestas"
type: issue
milestone: "Fase 1 — Design system"
labels: [tipo:design, area:design-system]
depends_on: [DS-03, DS-04]
---

## Contexto
O canvas é o diferencial do produto (RF-EDT-01, RF-OBS-01). Antes de ligar React Flow aos dados (#{EDT-01}), esta
issue define os blocos visuais que todos os tipos de nó e grupo usam, já com o estado de execução (ember no nó
rodando), para que editor e execução ao vivo tenham a mesma aparência.

## Objetivo
Existem `BaseNode`, `PortHandle`, `GroupFrame` e `FlowEdge` como componentes React Flow customizados, com tema do
canvas e uma página de demonstração em `/styleguide/canvas`.

## Escopo
**Inclui:** componentes visuais, tema do React Flow (fundo de pontos, minimapa, controles), demonstração estática.
**Não inclui:** dados reais, edição e conexão (#{EDT-01}…#{EDT-04}).

## Especificação técnica
### Arquivos
Criar:
- `src/web/canvas/base/base_node.tsx`
- `src/web/canvas/base/port_handle.tsx`
- `src/web/canvas/base/group_frame.tsx`
- `src/web/canvas/base/flow_edge.tsx`
- `src/web/canvas/base/canvas_theme.css`
- `src/web/canvas/base/node_type_icons.ts`
- `src/web/app/styleguide_canvas_page.tsx`
- `src/web/canvas/base/base_node.test.tsx`
Alterar:
- `src/web/app/routes.tsx` (rota `/styleguide/canvas`)

### Contratos
```tsx
export interface BaseNodeProps {
    typeIcon: LucideIcon; typeLabel: string; label: string;
    summary?: ReactNode;                // ex.: "opus · effort high"
    inputs: { name: string; type: string; required: boolean }[];
    outputs: { name: string; type: string }[];
    status?: ExecutionStatus;           // modo execução
    badge?: ReactNode;                  // ex.: "item #42"
    selected?: boolean; invalid?: boolean; compact?: boolean; // compact = zoom < 50%: só cabeçalho
}
export function BaseNode(props: BaseNodeProps): JSX.Element;
export function PortHandle(props: { side: "left" | "right"; name: string; type: string; required?: boolean; connectable?: boolean }): JSX.Element;
export function GroupFrame(props: { kind: "loop" | "map"; label: string; configLabel: string; // "map ×3", "loop ≤5"
    progress?: { queued: number; running: number; succeeded: number; failed: number }; selected?: boolean; invalid?: boolean }): JSX.Element;
export function FlowEdge(props: EdgeProps & { data?: { flowing?: boolean; invalid?: boolean } }): JSX.Element;
export const NODE_TYPE_ICONS: Record<"trigger" | "source" | "agent" | "script" | "condition" | "gate" | "git" | "output", LucideIcon>;
```
Ícones: trigger `Zap`, source `Inbox`, agent `Bot`, script `Terminal`, condition `GitFork`, gate `Hand`, git `GitPullRequest`, output `Flag`.

### Passo a passo
1. `canvas_theme.css`: fundo `--color-canvas` com pontos `--color-canvas-dot` (gap 20 px), controles e minimapa nos tokens.
2. `BaseNode`: largura 240 px, raio `--radius-md`, cabeçalho com ícone do tipo + rótulo + `StatusBadge` (sem texto), corpo com `summary`, portas rotuladas nas laterais (nome em 12 px, tipo no tooltip). `status=RUNNING` aplica `animate-ember`.
3. `GroupFrame`: moldura tracejada 1 px (`--color-border`), rótulo no canto superior esquerdo com `configLabel`, contadores "2 rodando · 1 na fila · 4 feitos" quando `progress` existe.
4. `FlowEdge`: bezier 1.5 px `--color-border`; `flowing` → tracejado animado em `--status-running`; `invalid` → `--status-failed`.
5. Página `/styleguide/canvas` com React Flow estático mostrando cada estado.

### Notas de design
Selecionado: borda 1.5 px `--color-accent`. Inválido: borda `--status-failed` + ícone `AlertTriangle` no cabeçalho.
Nó compacto (zoom < 50%) mostra só o cabeçalho. Portas obrigatórias com círculo cheio; opcionais vazado.

## Critérios de aceite
- [ ] Cada estado de execução renderiza no `BaseNode` com ícone e cor certos; RUNNING anima (sem animação com reduced motion).
- [ ] `GroupFrame` mostra `configLabel` e contadores.
- [ ] Aresta `flowing` é tracejada e animada; `invalid` em vermelho.
- [ ] `/styleguide/canvas` exibe todos os casos nos dois temas.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `base_node.test.tsx` (dentro de `ReactFlowProvider`, `ResizeObserver` mockado): rótulos das portas, badge de estado com nome acessível, modo compacto oculta o corpo.
