import type {
    DocumentedType,
    FieldDoc,
    FieldOptionDoc,
    NodeDoc,
    NodeExample,
    PortDoc,
} from "@/web/docs/node_docs/node_doc.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";
import { groupNodeDocsByCategory } from "@/web/docs/node_docs_index.js";
import type { NodeDocsCategoryGroup } from "@/web/docs/node_docs_index.js";

export const NODE_DOCS_MARKDOWN_DIRECTORY = "docs/nos";
export const NODE_DOCS_INDEX_FILE_NAME = "README.md";

export interface NodeDocsMarkdownFile {
    fileName: string;
    content: string;
}

const GENERATED_NOTICE =
    "<!-- Gerado por `npm run docs:nodes` a partir de src/web/docs/node_docs. Não edite à mão. -->";
const NO_PORTS_TEXT = "Nenhuma.";
const PORT_TABLE_HEADER = [
    "| Porta | Nome técnico | Tipo | Obrigatória | Descrição |",
    "| --- | --- | --- | --- | --- |",
];
const JSON_INDENT_SPACES = 2;

export function renderNodeDocsMarkdownFiles(docs: NodeDoc[]): NodeDocsMarkdownFile[] {
    const nodeFiles = docs.map((doc) => ({
        fileName: nodeDocFileName(doc.type),
        content: renderNodeDocMarkdown(doc),
    }));

    return [
        ...nodeFiles,
        { fileName: NODE_DOCS_INDEX_FILE_NAME, content: renderNodeDocsIndexMarkdown(docs) },
    ];
}

export function nodeDocFileName(type: DocumentedType): string {
    return `${type}.md`;
}

export function renderNodeDocMarkdown(doc: NodeDoc): string {
    return joinBlocks([
        GENERATED_NOTICE,
        `# ${escapeText(doc.title)}`,
        `> ${escapeText(doc.tagline)}`,
        `## O que faz`,
        escapeText(doc.whatItDoes),
        ...renderBulletSection("Quando usar", doc.whenToUse),
        ...renderBulletSection("Quando não usar", doc.whenNotToUse ?? []),
        ...renderPortsSection("Entradas", doc.ports.inputs),
        ...renderPortsSection("Saídas", doc.ports.outputs),
        ...renderFieldsSection(doc.fields),
        ...renderExamplesSection(doc.examples),
        ...renderBulletSection("Erros comuns", doc.pitfalls),
        ...renderRelatedSection(doc.related),
    ]);
}

export function renderNodeDocsIndexMarkdown(docs: NodeDoc[]): string {
    return joinBlocks([
        GENERATED_NOTICE,
        "# Nós da Forja",
        "Cada nó e cada grupo do editor de fluxos, por categoria.",
        ...groupNodeDocsByCategory(docs).flatMap(renderIndexCategory),
    ]);
}

function renderIndexCategory(group: NodeDocsCategoryGroup): string[] {
    const links = group.docs.map(
        (doc) => `- ${renderNodeDocLink(doc.type)} — ${escapeText(doc.tagline)}`,
    );

    return [`## ${group.label}`, links.join("\n")];
}

function renderBulletSection(title: string, lines: string[]): string[] {
    if (lines.length === 0) {
        return [];
    }

    return [`## ${title}`, renderBulletList(lines.map(escapeText))];
}

function renderPortsSection(title: string, ports: PortDoc[]): string[] {
    if (ports.length === 0) {
        return [`## ${title}`, NO_PORTS_TEXT];
    }

    return [`## ${title}`, [...PORT_TABLE_HEADER, ...ports.map(renderPortRow)].join("\n")];
}

function renderPortRow(port: PortDoc): string {
    const cells = [
        escapeTableCell(port.label),
        `\`${port.name}\``,
        `\`${port.type}\``,
        port.required ? "sim" : "não",
        escapeTableCell(port.description),
    ];

    return `| ${cells.join(" | ")} |`;
}

function renderFieldsSection(fields: FieldDoc[]): string[] {
    if (fields.length === 0) {
        return [];
    }

    return ["## Campos", ...fields.flatMap(renderField)];
}

function renderField(field: FieldDoc): string[] {
    const advancedMark = field.advanced ? " · avançado" : "";
    const heading = `### ${escapeText(field.label)} (\`${field.key}\`)${advancedMark}`;
    const details = [
        ...(field.defaultValue ? [`- Padrão: ${escapeText(field.defaultValue)}`] : []),
        ...(field.options ? [renderFieldOptions(field.options)] : []),
    ];

    return [heading, escapeText(field.description), ...nonEmptyBlock(details)];
}

function renderFieldOptions(options: FieldOptionDoc[]): string {
    const optionLines = options.map(
        (option) =>
            `  - \`${option.value}\` — ${escapeText(option.label)}: ${escapeText(option.description)}`,
    );

    return ["- Opções:", ...optionLines].join("\n");
}

function renderExamplesSection(examples: NodeExample[]): string[] {
    if (examples.length === 0) {
        return [];
    }

    return ["## Exemplos", ...examples.flatMap(renderExample)];
}

function renderExample(example: NodeExample): string[] {
    const configBlock = example.config ? [renderJsonCodeBlock(example.config)] : [];

    return [`### ${escapeText(example.title)}`, escapeText(example.description), ...configBlock];
}

function renderJsonCodeBlock(config: Record<string, unknown>): string {
    return ["```json", JSON.stringify(config, null, JSON_INDENT_SPACES), "```"].join("\n");
}

function renderRelatedSection(related: DocumentedType[]): string[] {
    if (related.length === 0) {
        return [];
    }

    return ["## Relacionados", renderBulletList(related.map(renderNodeDocLink))];
}

function renderNodeDocLink(type: DocumentedType): string {
    return `[${escapeText(getNodeDoc(type).title)}](${nodeDocFileName(type)})`;
}

function renderBulletList(lines: string[]): string {
    return lines.map((line) => `- ${line}`).join("\n");
}

function nonEmptyBlock(lines: string[]): string[] {
    return lines.length === 0 ? [] : [lines.join("\n")];
}

function joinBlocks(blocks: string[]): string {
    return `${blocks.join("\n\n")}\n`;
}

function escapeText(text: string): string {
    return text.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeTableCell(text: string): string {
    return escapeText(text).replaceAll("|", "\\|");
}
