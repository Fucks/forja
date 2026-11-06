---
key: DS-02
title: "Componentes de formulário do design system"
type: issue
milestone: "Fase 1 — Design system"
labels: [tipo:design, area:design-system]
depends_on: [DS-01]
---

## Contexto

Configurações de projeto, credenciais, inspector do nó e gatilhos são formulários densos. Com os tokens de
#{DS-01}, esta issue cria os componentes de entrada que todas essas telas reutilizam (RNF-ACE-01).

## Objetivo

Existem `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Switch`, `Slider`, `SegmentedControl` e `Field`
acessíveis, com estados e testes.

## Escopo

**Inclui:** os componentes acima sobre Radix UI, helper `cn`, integração com React Hook Form via `forwardRef`.
**Não inclui:** overlays e feedback (#{DS-03}), editor de prompt (#{EDT-05}).

## Especificação técnica

### Arquivos

Criar:

- `src/web/components/ui/cn.ts`
- `src/web/components/ui/button.tsx`
- `src/web/components/ui/icon_button.tsx`
- `src/web/components/ui/input.tsx`
- `src/web/components/ui/textarea.tsx`
- `src/web/components/ui/select.tsx`
- `src/web/components/ui/switch.tsx`
- `src/web/components/ui/slider.tsx`
- `src/web/components/ui/segmented_control.tsx`
- `src/web/components/ui/field.tsx`
- `src/web/components/ui/form_components.test.tsx`

### Contratos

```tsx
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button(
    props: ButtonProps & {
        variant?: ButtonVariant;
        size?: "sm" | "md";
        loading?: boolean;
        asChild?: boolean;
    },
): JSX.Element;
export function IconButton(
    props: { label: string; icon: LucideIcon } & ButtonHTMLAttributes<HTMLButtonElement>,
): JSX.Element; // label vira aria-label + tooltip
export const Input: ForwardRefExoticComponent<InputProps & { invalid?: boolean; mono?: boolean }>;
export const Textarea: ForwardRefExoticComponent<
    TextareaProps & { invalid?: boolean; mono?: boolean }
>;
export function Select<T extends string>(props: {
    value: T;
    onChange(v: T): void;
    options: { value: T; label: string; hint?: string }[];
    placeholder?: string;
    invalid?: boolean;
}): JSX.Element;
export function Switch(props: {
    checked: boolean;
    onChange(v: boolean): void;
    label: string;
}): JSX.Element;
export function Slider(props: {
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange(v: number): void;
    label: string;
}): JSX.Element;
export function SegmentedControl<T extends string>(props: {
    value: T;
    onChange(v: T): void;
    options: { value: T; label: string }[];
    label: string;
}): JSX.Element; // usado para effort
export function Field(props: {
    label: string;
    hint?: string;
    error?: string;
    htmlFor: string;
    children: ReactNode;
}): JSX.Element;
```

### Passo a passo

1. `cn()` com `clsx` + `tailwind-merge`.
2. Implemente cada componente só com tokens (`bg-surface`, `border-border`, `ring-accent`); altura 32 px (`md`) e 28 px (`sm`).
3. Foco visível com anel `--color-accent` 2 px; `invalid` usa borda `--status-failed` e `aria-invalid`.
4. `Field` liga `label`, `hint` e `error` por `aria-describedby`.

### Notas de design

Densidade de ferramenta técnica: texto 13 px, padding horizontal 10 px. Botão primário em `--color-accent` com
texto `#14161A`; `ghost` sem borda para barras de ferramentas. `mono` usa JetBrains Mono (ids, comandos).

## Critérios de aceite

- [ ] Todos os componentes operam por teclado e têm nome acessível.
- [ ] `Button loading` fica desabilitado e anuncia `aria-busy`.
- [ ] `Field` com `error` liga a mensagem ao controle por `aria-describedby`.
- [ ] Nenhum componente usa cor hex literal.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `form_components.test.tsx`: clique e teclado no Button; IconButton tem `aria-label`; Select muda valor por teclado; Switch alterna; SegmentedControl com setas; Field liga erro.
