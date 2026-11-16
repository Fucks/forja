import { readFileSync } from "node:fs";
import path from "node:path";

import type { NodeDoc } from "@/web/docs/node_docs/node_doc.js";
import { ALL_NODE_DOCS, NODE_DOCS } from "@/web/docs/node_docs/node_docs.js";
import {
    NODE_DOCS_INDEX_FILE_NAME,
    NODE_DOCS_MARKDOWN_DIRECTORY,
    nodeDocFileName,
    renderNodeDocMarkdown,
    renderNodeDocsIndexMarkdown,
} from "@/web/docs/render_node_doc_markdown.js";

const conditionDoc = NODE_DOCS.condition;

const OUTDATED_MESSAGE = "docs/nos está desatualizado: rode npm run docs:nodes";

function readGeneratedMarkdown(fileName: string): string {
    return readFileSync(path.resolve(NODE_DOCS_MARKDOWN_DIRECTORY, fileName), "utf8");
}

function buildDoc(overrides: Partial<NodeDoc>): NodeDoc {
    return { ...conditionDoc, ...overrides };
}

describe("renderNodeDocMarkdown", () => {
    it("starts with the title and the tagline", () => {
        const markdown = renderNodeDocMarkdown(conditionDoc);

        expect(markdown).toContain(
            "# Decisão\n\n> Se a regra for verdadeira, segue por Sim; senão, por Não",
        );
    });

    it("lists the ports in a table with the technical name and the type", () => {
        const markdown = renderNodeDocMarkdown(conditionDoc);

        expect(markdown).toContain(
            "## Entradas\n\n| Porta | Nome técnico | Tipo | Obrigatória | Descrição |\n",
        );
        expect(markdown).toContain("| O que passa adiante | `value` | `json` | sim |");
    });

    it("says there are no ports when a side has none", () => {
        const markdown = renderNodeDocMarkdown(NODE_DOCS.map);

        expect(markdown).toContain("## Entradas\n\nNenhuma.");
        expect(markdown).toContain("## Saídas\n\nNenhuma.");
    });

    it("escapes pipes inside table cells", () => {
        const doc = buildDoc({
            ports: {
                inputs: [
                    {
                        name: "value",
                        label: "A | B",
                        type: "json",
                        required: false,
                        description: "x",
                    },
                ],
                outputs: [],
            },
        });

        const markdown = renderNodeDocMarkdown(doc);

        expect(markdown).toContain("| A \\| B | `value` | `json` | não | x |");
    });

    it("shows each field with its key, default and options", () => {
        const markdown = renderNodeDocMarkdown(NODE_DOCS.agent);

        expect(markdown).toContain("### Esforço (`effort`)");
        expect(markdown).toContain("- Padrão: Vazio (usa o do projeto)");
        expect(markdown).toContain("  - `low` — Baixo: Rápido e barato.");
    });

    it("marks advanced fields", () => {
        const markdown = renderNodeDocMarkdown(NODE_DOCS.agent);

        expect(markdown).toContain("### Máximo de ações (`maxTurns`) · avançado");
    });

    it("renders the example config as a JSON code block", () => {
        const markdown = renderNodeDocMarkdown(conditionDoc);

        expect(markdown).toContain(
            '### Reviewer aprovou?\n\nLiga o Resultado do Reviewer na entrada e testa se approved é verdadeiro.\n\n```json\n{\n  "condition": {\n    "op": "eq",',
        );
    });

    it("escapes angle brackets so tags in the text are shown, not swallowed", () => {
        const doc = buildDoc({ whatItDoes: "Escreve <promise>COMPLETE</promise>." });

        const markdown = renderNodeDocMarkdown(doc);

        expect(markdown).toContain("Escreve &lt;promise&gt;COMPLETE&lt;/promise&gt;.");
    });

    it("links the related nodes to their markdown files", () => {
        const markdown = renderNodeDocMarkdown(conditionDoc);

        expect(markdown).toContain(
            "## Relacionados\n\n- [Agente](agent.md)\n- [Comando](script.md)",
        );
    });
});

describe("renderNodeDocsIndexMarkdown", () => {
    it("groups the nodes by category in catalog order", () => {
        const markdown = renderNodeDocsIndexMarkdown(ALL_NODE_DOCS);

        expect(markdown.indexOf("## Início")).toBeLessThan(markdown.indexOf("## Grupos"));
        expect(markdown).toContain(
            "## Decidir\n\n- [Decisão](condition.md) — Se a regra for verdadeira, segue por Sim; senão, por Não",
        );
    });
});

describe("docs/nos", () => {
    it.each(ALL_NODE_DOCS)("has the current markdown of $type", (doc) => {
        const generatedMarkdown = readGeneratedMarkdown(nodeDocFileName(doc.type));

        expect(generatedMarkdown, OUTDATED_MESSAGE).toBe(renderNodeDocMarkdown(doc));
    });

    it("has the current index", () => {
        const generatedIndex = readGeneratedMarkdown(NODE_DOCS_INDEX_FILE_NAME);

        expect(generatedIndex, OUTDATED_MESSAGE).toBe(renderNodeDocsIndexMarkdown(ALL_NODE_DOCS));
    });

    it("keeps the index stable", () => {
        expect(renderNodeDocsIndexMarkdown(ALL_NODE_DOCS)).toMatchSnapshot();
    });
});
