---
key: EDT-08
title: "Erros de validação no canvas e publicação de versão"
type: issue
milestone: "Fase 4 — Editor visual"
labels: [tipo:feature, area:editor]
depends_on: [EDT-07]
---

## Contexto
Atende RF-EDT-05 e RF-EDT-07. O usuário precisa saber, enquanto desenha, o que impede o fluxo de rodar, e publicar
uma versão quando estiver pronto. A validação é a mesma função pura do servidor (`validateFlowGraph` +
`checkPromptVariables`, #{FLW-02}/#{FLW-03}), rodada no cliente a cada mudança. Runs ficam presas à versão; o editor
precisa deixar claro "você está editando o rascunho; a v3 é a que roda".

## Objetivo
O canvas marca nós, arestas e grupos com erro, lista os problemas num painel clicável e publica a versão pela API,
mostrando os erros do servidor quando a publicação é recusada.

## Escopo
**Inclui:** validação contínua (debounce), marcação no canvas, painel de problemas, barra de publicação com nota,
banner de versão.
**Não inclui:** lista e diff de versões (#{EDT-10}).

## Especificação técnica
### Arquivos
Criar:
- `src/web/canvas/use_validation.ts`
- `src/web/canvas/validation_overlay.tsx`
- `src/web/canvas/problems_panel.tsx`
- `src/web/canvas/publish_bar.tsx`
- `src/web/canvas/use_validation.test.ts`
- `src/web/canvas/publish_bar.test.tsx`
Alterar:
- `src/web/canvas/flow_canvas.tsx` (passar `invalid` para nós/arestas/grupos)
- `src/web/app/flows/flow_editor_page.tsx` (barra de publicação e painel de problemas)

### Contratos
```ts
export function useValidation(graph: FlowGraph, context: ValidationContext): { issues: ValidationIssue[]; byTarget: Map<string, ValidationIssue[]>; errorCount: number; warningCount: number };
export function PublishBar(props: { flowId: string; latestVersion?: number; draftDiffers: boolean; errorCount: number; onPublished(v: FlowVersion): void }): JSX.Element;
```
`draftDiffers`: compara o rascunho com a última versão publicada (igualdade estrutural após normalização — reutilize o
normalizador de #{FLW-05} movendo-o para `src/shared/normalize_flow_graph.ts`).

### Passo a passo
1. `useValidation` com debounce de 250 ms e memo por revisão.
2. Overlay: nós/grupos com erro recebem `invalid`; tooltip no ícone de alerta lista as mensagens.
3. Painel "Problemas" recolhível no rodapé do canvas: lista erros e avisos; clicar seleciona o alvo e centraliza (`fitView` no nó).
4. Barra de publicação: "Rascunho · última versão publicada v3" + botão "Publicar v4" (desabilitado com erros; tooltip "Corrija 2 erros") + campo de nota; 422 do servidor exibe as issues no painel.
5. Toast "v4 publicada" e invalidação das queries de versões.

### Notas de design
Erros em `--status-failed`, avisos em `--status-waiting-approval`. A barra de publicação fica no topo da área do canvas.

## Critérios de aceite
- [ ] Remover o trigger mostra o erro "no_trigger" no painel em até 250 ms.
- [ ] Clicar num problema seleciona e centraliza o nó.
- [ ] Publicar com erro fica desabilitado; sem erro, publica e mostra a nova versão.
- [ ] Rascunho igual à última versão desabilita "Publicar" com o texto "Nada novo para publicar".
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `use_validation.test.ts`: agrupamento por alvo, contagens, debounce.
- `publish_bar.test.tsx`: estados desabilitados, publicação com sucesso e 422.
