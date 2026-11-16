# Issue #186: Catálogo tipado de documentação dos nós e grupos

## Decisions

- Types live in `src/web/docs/node_docs/node_doc.ts` exactly as the issue contract (incl. `NODE_CATEGORIES`);
  `node_docs.ts` re-exports `NODE_CATEGORIES` and owns `NODE_DOCS`, `getNodeDoc`, `CATEGORY_LABELS`.
- One file per documented type exporting `<type>Doc: NodeDoc` (`mapDoc`, `loopDoc` for groups).
- Content comes from epic #185 ("Conteúdo da documentação de cada nó"); Decisão and Comando document only
  the current fields (`condition`; `command`, `timeoutMinutes`, `workspace`).
- Completeness test derives everything from schemas: config keys from `<type>ConfigSchema.shape`, ports from
  `createDefaultNode`, enum values by unwrapping each zod field (optional/default/array) down to its `ZodEnum`.
  Loop's `exhausted` port is checked against `LOOP_EXHAUSTED_PORT`.
- `createDefaultNode` template labels and inspector titles are untouched (other issues own them).

## Tasks

- [x] 1. Types `NodeDoc`/`PortDoc`/`FieldDoc`/`NodeExample`/`NODE_CATEGORIES` — `node_doc.ts`
- [x] 2. Docs for trigger, source, agent, script — `*_doc.ts`
- [x] 3. Docs for condition, gate, git, output — `*_doc.ts`
- [x] 4. Docs for map and loop groups — `map_doc.ts`, `loop_doc.ts`
- [x] 5. Index `NODE_DOCS`, `getNodeDoc`, `CATEGORY_LABELS` — `node_docs.ts`
- [x] 6. Completeness test (fields, ports, enum options, tagline/examples/pitfalls) plus the
      deliberately incomplete doc case — `node_docs.test.ts`
- [ ] 7. `NODE_TYPE_LABELS` derives from the catalog — `node_type_labels.ts`
- [ ] 8. `PALETTE_ITEMS` description from the catalog tagline; palette test reads the catalog —
      `palette_items.ts`, `node_palette.test.tsx`
- [ ] 9. Self-review checklist and feedback loops (typecheck, lint, test)
