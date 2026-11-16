---
key: UX-02
title: "Guia de nós e conceitos no app e markdown gerado em docs/nos"
type: issue
milestone: "Fase 12 — Experiência de criação de fluxos"
labels: [tipo:feature, area:editor, documentation]
depends_on: [UX-01]
---

## Contexto

Atende RF-EDT-10 (épico #185). Com o catálogo de #{UX-01}, cada nó tem documentação estruturada, mas ela ainda não
aparece em lugar nenhum para leitura completa. O usuário precisa de uma página por nó e de uma página de conceitos
(item, porta, run, map, loop, workspace, como os dados andam). O repositório precisa da mesma documentação em
markdown, gerada a partir do catálogo para nunca divergir.

## Objetivo

Existem as rotas `/docs/nodes`, `/docs/nodes/:type` e `/docs/concepts`, o item "Documentação" na barra lateral, um
`NodeDocView` reutilizável (que #{UX-03} e #{UX-05} abrem em drawer) e `npm run docs:nodes`, que gera `docs/nos/*.md`.
Um teste falha se o markdown estiver desatualizado.

## Escopo

**Inclui:** páginas, `NodeDocView`, `NodeDocDrawer`, conceitos, gerador de markdown e teste de sincronia.
**Não inclui:** os botões que abrem o drawer a partir da paleta, do nó e do inspector (#{UX-03}, #{UX-04}, #{UX-05}).

## Especificação técnica

### Arquivos

Criar:

- `src/web/app/docs/node_docs_index_page.tsx` (índice por categoria, com busca)
- `src/web/app/docs/node_doc_page.tsx` (lê `:type`; tipo desconhecido mostra "Nó não encontrado" com link ao índice)
- `src/web/app/docs/concepts_page.tsx`
- `src/web/docs/node_doc_view.tsx` (renderiza um `NodeDoc`: título, tagline, o que faz, quando usar, quando não usar,
  tabela de entradas e saídas, campos com opções e padrão, exemplos com o trecho de config em bloco mono, erros comuns,
  relacionados com link)
- `src/web/docs/node_doc_drawer.tsx` (`<NodeDocDrawer type open onOpenChange />`, usa o drawer do design system)
- `src/web/docs/concepts.ts` (conteúdo dos conceitos como dados: `{ id, title, body: string[] }[]`)
- `src/web/docs/render_node_doc_markdown.ts` (`renderNodeDocMarkdown(doc): string`, `renderNodeDocsIndexMarkdown(docs): string`)
- `scripts/generate_node_docs.ts`
- `src/web/docs/node_docs_markdown.test.ts`
- `src/web/app/docs/node_doc_page.test.tsx`
- `docs/nos/README.md` e `docs/nos/<tipo>.md` (gerados; commitados)

Alterar:

- `src/web/app/routes.tsx` (rotas globais `docs/nodes`, `docs/nodes/:type`, `docs/concepts`, fora de
  `projects/:projectId`)
- `src/web/app/sidebar.tsx` (item "Documentação", ícone `BookOpen`)
- `package.json` (script `"docs:nodes": "tsx scripts/generate_node_docs.ts"`; use o runner de scripts TS que o projeto
  já usa em `scripts/`)

### Conceitos (conteúdo mínimo de `concepts.ts`)

Item de trabalho · Run · Nó e contexto limpo · Porta e tipos (com o ícone de cada tipo) · Como os dados andam (o item
implícito dentro do Map, as saídas de nós anteriores e o espaço de nomes `item.*`, `inputs.*`, `nodes.*`, `run.*` e
`project.*`; até #{UX-06} existir, descreva só `item.*` e `inputs.*`) · Map · Loop · Workspace do item.

### Passo a passo

1. Implemente `renderNodeDocMarkdown` (títulos `#`/`##`, tabelas de portas e campos, exemplos em bloco de código).
2. Escreva `generate_node_docs.ts`, que grava `docs/nos/<type>.md` e `docs/nos/README.md` (índice por categoria) e
   aceita `--check`, que sai com código 1 se algum arquivo diferir.
3. Faça `NodeDocView`, as três páginas, as rotas e o item na barra lateral.
4. Rode `npm run docs:nodes` e commite os `.md` gerados.

### Notas de design

- Superfície: configurações/leitura. Largura de leitura de até 72ch, tipografia de UI, exemplos em mono.
- Cada campo mostra o rótulo, o nome técnico em mono discreto, a descrição, o padrão e as opções como lista de
  definição.
- Acessibilidade: cabeçalhos hierárquicos; o índice navega por teclado e a busca tem `aria-label`.
- Estado vazio da busca: "Nenhum nó com esse termo".

## Critérios de aceite

- [ ] `/docs/nodes` lista os 10 documentos agrupados pelas categorias de `CATEGORY_LABELS`, com busca por título,
      tagline e `whenToUse`.
- [ ] `/docs/nodes/condition` mostra a documentação da Decisão; `/docs/nodes/xyz` mostra "Nó não encontrado".
- [ ] `/docs/concepts` mostra os conceitos.
- [ ] `NodeDocDrawer` abre e fecha com teclado (Esc fecha).
- [ ] `npm run docs:nodes` gera `docs/nos/*.md`; com `--check`, sai com 1 se estiverem desatualizados.
- [ ] O teste de sincronia falha quando o catálogo muda sem regenerar o markdown.
- [ ] `npm run typecheck`, `npm run lint` e `npm run test` passam.

## Testes

- `node_docs_markdown.test.ts`: para cada doc, `renderNodeDocMarkdown(doc)` é igual ao conteúdo de `docs/nos/<type>.md`
  (lido do disco); snapshot do índice.
- `node_doc_page.test.tsx`: renderiza a página da Decisão, o tipo desconhecido e a busca do índice.
