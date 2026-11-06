---
key: DS-03
title: "Componentes de feedback, overlay e StatusBadge"
type: issue
milestone: "Fase 1 — Design system"
labels: [tipo:design, area:design-system]
depends_on: [DS-01]
---

## Contexto

O estado de execução aparece no canvas, no board, no histórico e nos logs, e o PRD exige que ele seja sempre cor

- ícone + rótulo (RNF-ACE-01). Esta issue cria o mapa único de estados e os componentes de overlay e feedback.

## Objetivo

Existem `Dialog`, `Drawer`, `Toast`, `Tooltip`, `Tabs`, `Skeleton`, `EmptyState`, `KeyValue` e `StatusBadge`, e
o mapa `EXECUTION_STATUS_STYLES` com cor, ícone e rótulo de cada estado.

## Escopo

**Inclui:** os componentes acima (Radix), o mapa de estados, provider de toasts.
**Não inclui:** shell (#{DS-04}), nós do canvas (#{DS-05}).

## Especificação técnica

### Arquivos

Criar:

- `src/web/components/ui/execution_status.ts`
- `src/web/components/ui/status_badge.tsx`
- `src/web/components/ui/dialog.tsx`
- `src/web/components/ui/drawer.tsx`
- `src/web/components/ui/toast.tsx`
- `src/web/components/ui/tooltip.tsx`
- `src/web/components/ui/tabs.tsx`
- `src/web/components/ui/skeleton.tsx`
- `src/web/components/ui/empty_state.tsx`
- `src/web/components/ui/key_value.tsx`
- `src/web/components/ui/feedback_components.test.tsx`
- `src/web/components/ui/execution_status.test.ts`

### Contratos

```ts
// execution_status.ts
import type { NodeRunStatusName, RunStatusName } from "@/shared/events";
export type ExecutionStatus = NodeRunStatusName | RunStatusName; // união sem repetição
export interface StatusStyle {
    label: string;
    icon: LucideIcon;
    colorVar: string;
    animated: boolean;
}
export const EXECUTION_STATUS_STYLES: Record<ExecutionStatus, StatusStyle>;
```

Rótulos/ícones: PENDING "Pendente" `CircleDashed`; QUEUED "Na fila" `Clock`; RUNNING "Rodando" `Flame` (animated);
WAITING_APPROVAL "Aguardando aprovação" `Hand`; WAITING_LIMIT "Pausado por limite" `Hourglass`; PAUSED "Pausada"
`Pause`; SUCCEEDED "Sucesso" `CheckCircle2`; FAILED "Falha" `XOctagon`; CANCELED "Cancelado" `Ban`; SKIPPED
"Pulado" `SkipForward`; INTERRUPTED "Interrompido" `RotateCcw`. Cores = variáveis `--status-*` de #{DS-01}.

```tsx
export function StatusBadge(props: {
    status: ExecutionStatus;
    size?: "sm" | "md";
    showLabel?: boolean;
}): JSX.Element; // sem label visível, label vira aria-label
export function Drawer(props: {
    open: boolean;
    onOpenChange(v: boolean): void;
    side: "right" | "bottom";
    title: string;
    size?: number;
    children: ReactNode;
}): JSX.Element;
export function useToast(): {
    show(t: { title: string; description?: string; tone?: "info" | "success" | "error" }): void;
};
export function EmptyState(props: {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
}): JSX.Element;
export function KeyValue(props: {
    items: { label: string; value: ReactNode; mono?: boolean }[];
}): JSX.Element;
```

### Passo a passo

1. Escreva o mapa de estados e o teste que garante cobertura de todos os nomes de `events.ts`.
2. Implemente os componentes com tokens; Drawer lateral e inferior (redimensionável por prop `size`).
3. `ToastProvider` envolvendo a app em `main.tsx` (alterar).

### Notas de design

Overlays usam `--color-surface-raised`, raio `--radius-lg`, `--shadow-float`. Toast no canto inferior direito, some
em 5 s (erro fica até fechar). `Skeleton` com tom `--color-border`, sem shimmer chamativo.

## Critérios de aceite

- [ ] Todo `NodeRunStatusName` e `RunStatusName` tem estilo; o teste falha se faltar algum.
- [ ] `StatusBadge` mostra ícone + rótulo; sem rótulo visível, o rótulo vai para `aria-label`.
- [ ] Dialog e Drawer prendem o foco e fecham com Esc.
- [ ] Toast de erro não some sozinho.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `execution_status.test.ts`: cobertura dos estados.
- `feedback_components.test.tsx`: StatusBadge acessível; Dialog com foco preso e Esc; Toast aparece e some (timers fake); Tabs por teclado.
