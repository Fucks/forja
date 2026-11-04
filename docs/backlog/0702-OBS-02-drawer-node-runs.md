---
key: OBS-02
title: "Drawer do nó com NodeRuns, entradas e saídas"
type: issue
milestone: "Fase 7 — Execução ao vivo e logs"
labels: [tipo:feature, area:execucao-ao-vivo]
depends_on: [OBS-01]
---

## Contexto
Atende RF-OBS-02 e a oportunidade inspirada no n8n (benchmark): clicar no nó e ver exatamente o que entrou e saiu em cada
execução, e repetir uma execução específica. Um nó dentro de map tem um NodeRun por item, tentativa e iteração; o drawer
lista todos.

## Objetivo
Clicar num nó na tela da run abre um drawer inferior com a lista de NodeRuns daquele nó (item, iteração, tentativa,
estado, duração, custo), e o NodeRun selecionado mostra entradas, saídas, erro, artefatos e ações cancelar/repetir.

## Escopo
**Inclui:** drawer, lista, detalhe com abas "Logs" (vazia até #{OBS-03}), "Entradas", "Saídas", "Artefatos", ações.
**Não inclui:** streaming de logs (#{OBS-03}).

## Especificação técnica
### Arquivos
Criar:
- `src/web/canvas/live/node_run_drawer.tsx`
- `src/web/canvas/live/node_run_list.tsx`
- `src/web/canvas/live/node_run_detail.tsx`
- `src/web/canvas/live/json_view.tsx`
- `src/web/canvas/live/node_run_sorting.ts`
- `src/web/canvas/live/node_run_sorting.test.ts`
- `src/web/canvas/live/node_run_drawer.test.tsx`
Alterar:
- `src/web/canvas/live/run_canvas.tsx` (clique no nó abre o drawer)
(As entradas já são gravadas no NodeRun pelo executor — #{ENG-10} — e voltam em `GET /api/node-runs/:id`, #{ENG-12}.)

### Contratos
```ts
export function sortNodeRuns(nodeRuns: NodeRunState[]): NodeRunState[]; // RUNNING primeiro, depois por item, iteração desc, tentativa desc
export function describeNodeRun(nr: NodeRunState): string; // "item #42 · iteração 2 · tentativa 1"
```
`JsonView`: árvore recolhível em mono, strings longas truncadas com "ver tudo", botão copiar.

### Passo a passo
1. Ordenação e descrição puras.
2. Drawer (Drawer inferior de #{DS-03}, altura redimensionável 30–80%), lista à esquerda (320 px), detalhe à direita com abas.
3. Ações: "Cancelar" (RUNNING/QUEUED) e "Repetir" (FAILED/CANCELED/SUCCEEDED), com confirmação, via API de #{ENG-12}.
4. Erros: tipo traduzido ("Limite de uso", "Tempo esgotado (inatividade)", "Saída estruturada inválida"...) e mensagem.

### Notas de design
Lista densa, uma linha por NodeRun com `StatusBadge`, descrição, duração e custo à direita. O drawer não cobre a barra da run.

## Critérios de aceite
- [ ] Clicar no nó Dev de um map com 5 itens lista 5+ NodeRuns ordenados, com o RUNNING no topo.
- [ ] Selecionar um NodeRun mostra entradas e saídas como JSON navegável.
- [ ] Repetir um NodeRun falho chama a API e o novo NodeRun aparece na lista ao vivo.
- [ ] Erro de saída estruturada mostra o tipo traduzido e a mensagem.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `node_run_sorting.test.ts`; `node_run_drawer.test.tsx` (API mockada).
