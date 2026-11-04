---
key: DS-06
title: "LogViewer virtualizado (componente base)"
type: issue
milestone: "Fase 1 — Design system"
labels: [tipo:design, area:design-system]
depends_on: [DS-03, DS-04]
---

## Contexto
Um NodeRun de implementação pode gerar dezenas de milhares de linhas (RNF-DES-02). O visualizador de logs precisa
ser virtualizado desde o início e ter a aparência definida no PRD (monoespaçado, ferramentas recolhíveis, erros
destacados). Os dados reais chegam em #{OBS-03}; aqui o componente recebe uma lista de linhas.

## Objetivo
Existe `LogViewer` virtualizado que exibe `LogLine[]` com seguir-o-fim, busca com destaque, linhas recolhíveis e
cópia, e aguenta 100 mil linhas sem travar.

## Escopo
**Inclui:** `LogViewer`, `LogLine`, barra de ferramentas (buscar, seguir o fim, copiar, baixar), dados de exemplo no `/styleguide`.
**Não inclui:** streaming e renderização específica de eventos do agente (#{OBS-03}).

## Especificação técnica
### Arquivos
Criar:
- `src/web/logs/log_types.ts`
- `src/web/logs/log_viewer.tsx`
- `src/web/logs/log_line.tsx`
- `src/web/logs/log_toolbar.tsx`
- `src/web/logs/log_search.ts`
- `src/web/logs/log_search.test.ts`
- `src/web/logs/log_viewer.test.tsx`
Alterar:
- `src/web/app/styleguide_page.tsx` (seção LogViewer com 10 mil linhas geradas)

### Contratos
```ts
export type LogLineKind = "text" | "tool_call" | "tool_result" | "error" | "system" | "usage";
export interface LogLine {
    seq: number; offsetMs: number; kind: LogLineKind;
    text: string;          // primeira linha visível
    detail?: string;       // conteúdo recolhível (args/resultado de ferramenta)
    toolName?: string;
}
export function findMatches(lines: LogLine[], query: string): number[]; // seqs, case-insensitive, inclui detail
```
```tsx
export function LogViewer(props: {
    lines: LogLine[]; follow?: boolean; onFollowChange?(v: boolean): void;
    onDownloadRaw?(): void; emptyLabel?: string; loading?: boolean;
}): JSX.Element;
```

### Passo a passo
1. `findMatches` puro e testado.
2. `LogViewer` com `useVirtualizer` (altura estimada 20 px, medição dinâmica para linhas expandidas).
3. Seguir o fim: ligado por padrão; rolar para cima desliga e mostra botão "Ir para o fim"; ligar volta ao fim.
4. Busca: Ctrl/Cmd+F dentro do viewer foca o campo; Enter/Shift+Enter navega entre ocorrências.
5. Copiar linha (hover) e copiar tudo visível; botão baixar chama `onDownloadRaw`.

### Notas de design
JetBrains Mono 13 px, `line-height` 1.5, fundo `--color-canvas`. Coluna de offset (`+00:42`, via `formatRelativeOffset`
de #{F-07}) em `--color-text-muted`. `tool_call`: nome da ferramenta em `--color-steel` 500, seta para expandir.
`error`: faixa de 2 px `--status-failed` à esquerda. Estados: carregando (Skeleton), vazio (EmptyState).

## Critérios de aceite
- [ ] Com 100 mil linhas, só as visíveis são montadas no DOM (menos de 200 elementos de linha).
- [ ] Seguir o fim acompanha novas linhas e desliga ao rolar para cima.
- [ ] Busca encontra texto em `text` e em `detail`, e navega entre ocorrências.
- [ ] Linhas com `detail` expandem e recolhem por clique e teclado.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `log_search.test.ts`: case-insensitive, `detail`, consulta vazia.
- `log_viewer.test.tsx`: virtualização (contagem de elementos com 100 mil linhas), expandir, desligar seguir ao rolar.
