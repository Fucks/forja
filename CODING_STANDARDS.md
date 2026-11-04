# Coding Standards

The goal is code that a person can read top to bottom and understand **without comments**: names say what
things are, functions say what they do, and the flow of each function reads like a short description of the
behavior. When code needs a comment to explain _what_ it does, that is a signal to rename or extract — not to
write the comment.

These rules apply to every file in `src/` and `e2e/`. ESLint and Prettier enforce the mechanical
parts; the rest depends on judgment.

## Naming

Names carry most of the meaning, so spend time on them.

- **Reveal intent.** `pendingOrders`, not `list`; `calculateDeliveryFee`, not `calc`; `isStorePaused`, not `flag`.
- **Use whole words.** `quantity`, `variant`, `response` — not `qty`, `v`, `res`. Short names are fine only for
  tiny scopes with an obvious meaning (`i` in a 3-line loop, `a`/`b` in a sort comparator).
- **Put the unit in the name** when a number has one: `priceCents`, `distanceKm`, `timeoutMs`, `expiresAt`.
- **Booleans read as yes/no questions:** `isAdult`, `hasStock`, `canBeChilled`, `shouldNotify`. Avoid negatives
  (`isNotValid`) — `!isValid` reads better.
- **Functions are verbs** (`createOrder`, `formatMoney`, `findVariantBySku`); values are nouns.
  If a function has a side effect, the name says so (`saveCart`, `sendNotification`), and a function named
  like a query (`getX`, `isX`) never changes state.
- **Avoid empty words:** `data`, `info`, `item`, `obj`, `temp`, `value`, `manager`, `helper`, `utils`, `handle`
  — unless nothing more specific exists.
- **One word per concept across the codebase.** If the issue/PRD calls it a `variant`, don't call it `sku`
  in one file and `option` in another. Use the exact names given in the issue's contracts.
- **Language:** identifiers in English; user-facing text (labels, messages, errors shown to customers) in
  Brazilian Portuguese.

## Functions

- **Do one thing.** If you describe a function with "and" ("validates the cart _and_ calculates the fee
  _and_ saves the order"), split it so the top-level function reads as those three named steps.
- **One level of abstraction per function.** A function that orchestrates (`createOrder`) calls named steps;
  it doesn't also contain low-level string parsing.
- **Prefer early returns (guard clauses)** over nested `if`/`else`. Handle the invalid cases first, then write
  the main path without indentation.
- **Keep them short** — most functions fit in ~20 lines. Length is a symptom, not the rule: extract when a
  block deserves a name.
- **Few parameters.** Up to three positional parameters; beyond that, use a single object parameter with
  named fields.
- **No boolean flag parameters** (`render(true)`). Split into two functions or use a named option
  (`{ includeInactive: true }`).
- **Prefer pure functions** for business rules: input in, result out, no hidden I/O. Inject dependencies
  (repositories, providers, `now`) instead of importing singletons — this is also what makes them testable.
- **Don't mutate arguments.** Return new values.

## Control flow

- Write files **top-down**: exported/public function first, the helpers it uses below it, in the order they
  are called. A reader should be able to stop after the first function and know what the file does.
- **No nested ternaries.** Use `if`/`else`, an early return, or a `switch`.
- **Max two levels of nesting** inside a function; deeper means a block wants to be its own function.
- **Replace long `if` chains that map values with a lookup object** (`const STATUS_LABELS: Record<OrderStatus, string> = {...}`).
- **Exhaustive `switch` on unions** with a `never` check in `default`, so adding a new case breaks the build
  instead of silently falling through.
- **Async/await**, not `.then()` chains. Run independent awaits together with `Promise.all`.
- **No clever one-liners.** Clear and slightly longer beats compact and puzzling.

## Values and constants

- **No magic numbers or strings.** `const PIX_EXPIRATION_MINUTES = 15;` instead of `15` buried in a formula.
  Constants live next to the code that owns the rule (or in the domain's `*_types.ts`), in `UPPER_CASE`.
- `const` by default; `let` only when reassignment is the clearest option.
- Money is always integer cents; format only at the UI edge.

## TypeScript

- `strict` is on. **No `any`.** Use `unknown` and narrow it.
- **Avoid `as` casts and non-null assertions (`!`).** If the type system can't prove it, prove it with a check.
  When a cast is truly necessary (e.g., a library typing gap), isolate it in one small function.
- **Model states with discriminated unions** (`{ ok: true; data } | { ok: false; error }`) instead of optional
  fields that are "sometimes set".
- **Derive types from Zod schemas** (`z.infer`) at the boundaries instead of declaring the same shape twice.
- **Explicit return types on exported functions** — they document the contract.

## Comments

The default is **no comment**. Code explains _what_ and _how_; a comment is only for _why_, when the reason
can't be expressed in code:

- a business rule that looks odd without context ("Pix expires with the order so the stock reservation is released together"),
- a workaround for a library/platform bug (with a link),
- a non-obvious performance or security constraint.

Never:

- comments that repeat the code (`// increment counter`, `// get user`),
- commented-out code (git keeps history),
- `TODO` without an issue reference (`TODO(#42): ...`),
- section banners inside functions (`// ---- validation ----`) — extract a function named `validate...` instead.

**Before / after:**

```ts
// Before: comments narrate what the code does
export function calc(o: Order, d: number) {
    // check if delivery
    if (o.type === "DELIVERY") {
        // find band
        const b = bands.find((x) => x.max >= d);
        if (b) {
            return o.subtotal + b.fee; // total with fee
        } else {
            throw new Error("out");
        }
    } else {
        return o.subtotal;
    }
}

// After: the code says it
export function calculateOrderTotalCents(order: Order, distanceKm: number): number {
    if (order.fulfillmentType === "PICKUP") {
        return order.subtotalCents;
    }

    const band = findDeliveryBand(distanceKm);
    if (!band) {
        throw new OutOfDeliveryAreaError(distanceKm);
    }

    return order.subtotalCents + band.feeCents;
}
```

## Errors

- Validate input at the boundaries (Server Actions, route handlers, webhooks) with Zod; inside the domain,
  trust the types.
- Throw domain errors with a clear name (`InsufficientStockError`, `OrderRejectedError`) — the class name
  should tell the reader what went wrong.
- Never swallow errors silently. If you catch, either handle it meaningfully or rethrow/convert it.
- Never show stack traces or internal messages to users.

## Structure

- Follow the folder layout defined in the PRD (`src/engine/`, `src/server/<domain>/...`, `src/web/...`,
  `src/integrations/...`).
- `src/engine/` is pure: no `node:fs`, `child_process`, database or `Date.now()` there — inject the `Clock`,
  the `AgentRuntime` and the repositories.
- **Reuse before creating.** Search for an existing helper, component or service before writing a new one;
  extend it if it almost fits. Duplication is a bug waiting to diverge.
- One concept per file; a file that grows past ~200 lines is usually two concepts.
- Routes and components stay thin: business rules live in services or in the engine.
- React: extract logic from components into hooks or pure functions with names that say what they compute.
- Delete code you made unused. No dead code, no unused exports, no "just in case" parameters.

## Formatting

- 4 spaces, no tabs; lines up to 100 characters; K&R braces; one blank line between logical blocks.
- File and folder names in `snake_case` (e.g., `run_service.ts`, `flow_canvas.tsx`), except names required
  by tools (`vite.config.ts`, `vitest.config.ts`, `drizzle.config.ts`, `index.html`).
- `camelCase` for variables and functions, `PascalCase` for types and components, `UPPER_CASE` for constants.
- Prettier and ESLint are the final word on formatting — run `npm run format` and `npm run lint`.

## Tests

Tests are documentation of behavior, so they follow the same readability rules.

- **Test names are sentences about behavior:** `it("rejects the order when the customer is under 18")`,
  not `it("test validate 2")`.
- **Arrange / act / assert**, separated by a blank line. One behavior per test.
- **Test through the public API** (service functions, component output), not private details.
- Use the factories and in-memory fakes in `src/test/` instead of building large literals in every test.
- `npm run test` never touches the network, Docker, the `claude` CLI or `.env` — use the fakes in `src/test/`
  (`FakeAgentRuntime`, `FakeClock`, in-memory SQLite). Tests that need the real thing go in
  `*.integration.test.ts` and run with `npm run test:integration`.
- Never weaken, skip or delete a test to make the suite pass; fix the code or, if the test is wrong, fix the
  test and say why in the commit.
