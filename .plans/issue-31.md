# Issue #31: Nós customizados por tipo no canvas

## Decisions

- `summarizeNode` / `describeGroupConfig` live in `src/web/canvas/nodes/node_summary.ts`
  (`describeGroupConfig` moves there from `provisional_nodes.tsx`, which is deleted at the end).
- Inherited agent model/effort: with `defaults` → `"opus-5-5 (padrão)"`; without → `"padrão"`.
  Model ids drop the `claude-` prefix for display.
- Conditions render as text (`review.approved = true`, `a e b`, `não (a)`).
- `GroupProgress` is exported from `group_frame.tsx` so `NodeLiveState` reuses it.
- Shared node shell `FlowNodeCard` (icon, label, ports, zoom, live state) in
  `src/web/canvas/nodes/flow_node_card.tsx` (extra file); `AgentNode` and `SimpleNode` only differ in
  how they draw the summary. `SimpleNode` serves all seven non-agent types.
- `nodeTypes` is built from a `Record<NodeType, ...>` so a new type breaks the build.

## Tasks

- [ ] 1. Test + implement `summarizeNode` for agent (explicit and inherited) — `node_summary.ts`
- [ ] 2. Test + implement `summarizeNode` for script, condition, gate — `node_summary.ts`
- [ ] 3. Test + implement `summarizeNode` for trigger, source, git, output — `node_summary.ts`
- [ ] 4. Test + move `describeGroupConfig` (map ×N, barreira, loop ≤N) — `node_summary.ts`
- [ ] 5. `NodeLiveContext` / `NodeLiveState` — `node_live_context.ts`, export `GroupProgress`
- [ ] 6. Test + implement `FlowNodeCard`, `SimpleNode`, `AgentNode` — `nodes.test.tsx`
- [ ] 7. Test + implement `GroupNode` with progress from context — `group_node.tsx`
- [ ] 8. Registry `nodeTypes` and use in `FlowCanvas`; delete `provisional_nodes.tsx`
- [ ] 9. Self-review checklist and feedback loops
