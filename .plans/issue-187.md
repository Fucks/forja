# Issue #187: Guia de nós e conceitos no app e markdown gerado em docs/nos

## Decisions

- Catalog from #186 (`NODE_DOCS`, `CATEGORY_LABELS`, `NODE_CATEGORIES`, `getNodeDoc`) is the only source.
  `findNodeDoc(type: string): NodeDoc | undefined` is added to `src/web/docs/node_docs/node_docs.ts` to
  look up a route param without a cast.
- Grouping by category and search (title, tagline, whenToUse; lowercase `includes`, like
  `filterPaletteItems`) live in `src/web/docs/node_docs_index.ts`, shared by the index page and the
  README markdown.
- `render_node_doc_markdown.ts` also exports `NODE_DOCS_MARKDOWN_DIRECTORY = "docs/nos"` and
  `renderNodeDocsMarkdownFiles(docs)` (file name + content); `scripts/generate_node_docs.ts` only does
  the file I/O and `--check`. Markdown shows port types by their technical name (`json`).
- `scripts` is added to the tsconfig include and to the ESLint typed files so the script is checked.
- `docs/nos` goes into `.prettierignore`: the files are generated, and Prettier would reformat them
  and break the sync test.
- Port type icons: create `src/web/canvas/base/port_type_icons.ts` with the #189 contract
  (`PORT_TYPE_ICONS`, `PORT_TYPE_LABELS`), so #189 reuses it. The concepts page shows them in the
  "ports" concept.
- `NodeDocView({ doc, placement: "page" | "drawer" })`: placement picks the heading levels (page: h1/h2/h3;
  drawer: h3/h4/h5 under the drawer title), so headings stay in order in both places.
- Sidebar item "Documentação" (BookOpen) goes in `GLOBAL_NAV` (`src/web/config/navigation.ts`), which the
  sidebar renders. The docs paths are defined there too.
- Data-flow concept describes only `item.*` and `inputs.*` (#191 is still open).

## Tasks

- [x] 1. Test + implement `renderNodeDocMarkdown` and `renderNodeDocsIndexMarkdown` — `src/web/docs/render_node_doc_markdown.ts`, `src/web/docs/node_docs_index.ts`
- [x] 2. Generator script with `--check`, `docs:nodes` script, tsconfig/eslint/prettierignore, generated `docs/nos/*.md`
- [x] 3. Sync test: every `docs/nos/<type>.md` and README equals the render, plus the index snapshot — `src/web/docs/node_docs_markdown.test.ts`
- [x] 4. `NodeDocView` and the `/docs/nodes/:type` page with "Nó não encontrado", plus routes and nav paths — tests in `src/web/app/docs/node_doc_page.test.tsx`
- [x] 5. `/docs/nodes` index page grouped by category, with search and empty state — test in `node_doc_page.test.tsx`
- [x] 6. Port type icons, concepts data and `/docs/concepts` page — test in `node_doc_page.test.tsx`
- [x] 7. Sidebar item "Documentação" + app shell route titles — `src/web/config/navigation.ts`, `src/web/app/app_shell.test.tsx`
- [x] 8. `NodeDocDrawer` that opens and closes with the keyboard (Esc) — `src/web/docs/node_doc_drawer.tsx` + test
- [ ] 9. Self-review checklist and feedback loops (typecheck, lint, test)
