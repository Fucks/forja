---
key: DS-01
title: "Tokens de design, fontes e tema Tailwind"
type: issue
milestone: "Fase 1 — Design system"
labels: [tipo:design, area:design-system]
depends_on: [F-09]
---

## Contexto
O PRD define a direção "oficina iluminada": interface escura e calma, cor só onde há atividade, estados de
execução com cor e ícone. Todas as telas e o canvas consomem estes tokens; cores hex soltas em componentes são
proibidas (`CODING_STANDARDS.md`). Atende RNF-ACE-01.

## Objetivo
Existem os tokens de cor (temas escuro e claro), tipografia, espaço, raio, sombra e motion em CSS variables,
mapeados no tema do Tailwind v4, com as fontes empacotadas localmente.

## Escopo
**Inclui:** `tokens.css`, tema Tailwind (`@theme`), fontes via `@fontsource`, alternância de tema, `prefers-reduced-motion`.
**Não inclui:** componentes (#{DS-02}, #{DS-03}).

## Especificação técnica
### Arquivos
Criar:
- `src/web/styles/tokens.css`
- `src/web/styles/theme.ts`
- `src/web/styles/theme.test.ts`
Alterar:
- `src/web/styles/global.css`
- `src/web/main.tsx` (importar fontes e aplicar o tema salvo)

### Contratos
`tokens.css` declara em `:root[data-theme="dark"]` (padrão) e `:root[data-theme="light"]` os valores do PRD:

| Token | Escuro | Claro |
|---|---|---|
| `--color-bg` | `#14161A` | `#F6F4F0` |
| `--color-canvas` | `#101215` | `#EFECE6` |
| `--color-canvas-dot` | `#22262C` | `#D9D4CA` |
| `--color-surface` | `#1C1F24` | `#FFFFFF` |
| `--color-surface-raised` | `#252930` | `#FAF8F5` |
| `--color-border` | `#2F343C` | `#DDD8CF` |
| `--color-text` | `#E8E6E1` | `#1F2125` |
| `--color-text-muted` | `#9AA0A8` | `#5E646C` |
| `--color-accent` | `#E8833A` | `#C2611F` |
| `--color-accent-strong` | `#FF9A4D` | `#A9521A` |
| `--color-steel` | `#7C93A8` | `#4F6A82` |

Estados (iguais nos dois temas): `--status-pending #5E646C`, `--status-queued #7C93A8`, `--status-running #E8833A`,
`--status-waiting-approval #D9B44A`, `--status-waiting-limit #B48EE0`, `--status-succeeded #5FB37A`,
`--status-failed #E2574C`, `--status-canceled #6B7078`, `--status-interrupted #C98A5B`.

Tipografia: `--font-sans: "IBM Plex Sans"`, `--font-condensed: "IBM Plex Sans Condensed"`, `--font-mono: "JetBrains Mono"`;
escala `--text-xs 12px`, `--text-sm 13px` (padrão da UI), `--text-md 14px`, `--text-lg 16px`, `--text-xl 20px`, `--text-2xl 24px`.
Raio: `--radius-sm 6px`, `--radius-md 10px`, `--radius-lg 14px`. Sombra flutuante: `--shadow-float 0 8px 24px rgb(0 0 0 / .35)`.
Motion: `--duration-fast 120ms`, `--duration-base 180ms`, `--ease-out cubic-bezier(.2,.8,.2,1)`; com
`prefers-reduced-motion: reduce`, durações viram `0ms` e a classe `animate-ember` não anima.

Animação `@keyframes ember` (brilho da borda do nó rodando, 2 s, alternando `box-shadow` com `--status-running`).

`@theme` do Tailwind expõe `bg-bg`, `bg-surface`, `text-muted`, `border-border`, `bg-accent`, `text-status-running` etc.

```ts
// src/web/styles/theme.ts
export type ThemeName = "dark" | "light";
export function readStoredTheme(storage: Pick<Storage, "getItem">): ThemeName; // padrão "dark"
export function applyTheme(theme: ThemeName, root: HTMLElement, storage: Pick<Storage, "setItem">): void;
```

### Passo a passo
1. Escreva `tokens.css` e o `@theme` em `global.css` (base: `body` com `bg-bg text-text font-sans text-sm`).
2. Importe as fontes (pesos 400/500/600 do Plex Sans; 600 do Condensed; 400/500 do JetBrains Mono).
3. Implemente `theme.ts` e aplique no boot.
4. Verifique contraste AA de texto e `text-muted` sobre `bg` e `surface` nos dois temas (anote os valores no PR).

### Notas de design
Nada de gradientes, neon ou sombras em cards — bordas de 1 px. A cor de acento é a "brasa": use com parcimônia.

## Critérios de aceite
- [ ] Os tokens da tabela existem com os valores exatos nos dois temas.
- [ ] Classes do Tailwind usam os tokens (`bg-surface`, `text-status-failed`...).
- [ ] O tema escuro é o padrão; o claro persiste após recarregar.
- [ ] As fontes carregam sem rede (arquivos locais).
- [ ] `prefers-reduced-motion` desliga a animação `ember`.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes
- `theme.test.ts`: padrão `dark`; valor inválido no storage cai para `dark`; `applyTheme` define `data-theme` e grava.
