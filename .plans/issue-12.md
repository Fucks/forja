# Issue #12: Componentes de formulário do design system

## Decisions

- All components live in `src/web/components/ui/`, styled only with the Tailwind tokens from #11
  (`bg-surface`, `border-border`, `ring-accent`, `border-status-failed`, `text-bg`...). No hex literals.
- Shared Tailwind class lists (focus ring, control box, invalid border, sizes) live in
  `src/web/components/ui/control_styles.ts` (extra file, so Input/Textarea/Select/Button don't diverge).
- Primary button text uses `text-bg` (dark theme `--color-bg` is exactly `#14161A`).
- `Button` uses Radix `Slot` + `Slottable` for `asChild`; `loading` → `disabled` + `aria-busy` + spinner.
- `IconButton` composes `Button variant="ghost"`; the tooltip is the native `title` (Radix `Tooltip`
  belongs to #13).
- `Field` provides a React context (`useFieldControlAttributes`) that gives the control its `id`
  (= `htmlFor`), `aria-describedby` (hint + error ids) and invalid state; Input, Textarea and Select
  consume it, so `Select` works inside a `Field` without an extra `id` prop.
- `SegmentedControl` = Radix ToggleGroup `type="single"` (radiogroup); arrows move focus and
  Space/Enter selects; clicking the active option (empty value) is ignored so there is always a value.
- `Select`/`SegmentedControl` narrow Radix's `string` back to `T` by looking up the option (no casts).
- jsdom polyfills Radix Select needs (pointer capture, scrollIntoView) stay in the test file.

## Tasks

- [x] 1. `cn()` with clsx + tailwind-merge — `cn.ts`
- [x] 2. Test + implement Button (click, keyboard, variants/sizes, loading → disabled + aria-busy, asChild) — `button.tsx`, `control_styles.ts`
- [x] 3. Test + implement IconButton (aria-label + title from label) — `icon_button.tsx`
- [x] 4. Test + implement Field (label, hint, error linked by aria-describedby) + context hook — `field.tsx`
- [x] 5. Test + implement Input and Textarea (forwardRef, invalid → aria-invalid, mono, Field integration) — `input.tsx`, `textarea.tsx`
- [ ] 6. Test + implement Select (keyboard changes value, hints, placeholder, invalid) — `select.tsx`
- [ ] 7. Test + implement Switch (toggles by click and keyboard, accessible name) — `switch.tsx`
- [ ] 8. Test + implement Slider (arrow keys change value, accessible name) — `slider.tsx`
- [ ] 9. Test + implement SegmentedControl (arrows + selection) — `segmented_control.tsx`
- [ ] 10. Self-review checklist and feedback loops (typecheck, lint, test, format)
