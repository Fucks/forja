import type { JSX, ReactNode } from "react";
import { Link } from "react-router";

import { nodeDocPath } from "@/web/config/navigation.js";
import { NodeDocFields } from "@/web/docs/node_doc_fields.js";
import { NodeDocPortsTable } from "@/web/docs/node_doc_ports_table.js";
import type { DocumentedType, NodeDoc, NodeExample } from "@/web/docs/node_docs/node_doc.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";

type NodeDocPlacement = "page" | "drawer";

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5";

interface NodeDocHeadings {
    title: HeadingTag;
    section: HeadingTag;
    item: HeadingTag;
}

// In the drawer the doc sits under the drawer's own h2 title.
const HEADINGS_BY_PLACEMENT: Record<NodeDocPlacement, NodeDocHeadings> = {
    page: { title: "h1", section: "h2", item: "h3" },
    drawer: { title: "h3", section: "h4", item: "h5" },
};

const JSON_INDENT_SPACES = 2;

export function NodeDocView({
    doc,
    placement,
}: {
    doc: NodeDoc;
    placement: NodeDocPlacement;
}): JSX.Element {
    const headings = HEADINGS_BY_PLACEMENT[placement];
    const TitleTag = headings.title;

    return (
        <article className="flex max-w-[72ch] flex-col gap-6">
            <header className="flex flex-col gap-1">
                <TitleTag className="font-condensed text-xl font-semibold">{doc.title}</TitleTag>
                <p className="text-muted">{doc.tagline}</p>
            </header>
            <DocSection heading={headings.section} title="O que faz">
                <p>{doc.whatItDoes}</p>
            </DocSection>
            <BulletSection heading={headings.section} title="Quando usar" lines={doc.whenToUse} />
            <BulletSection
                heading={headings.section}
                title="Quando não usar"
                lines={doc.whenNotToUse ?? []}
            />
            <DocSection heading={headings.section} title="Entradas e saídas">
                <NodeDocPortsTable caption="Entradas" ports={doc.ports.inputs} />
                <NodeDocPortsTable caption="Saídas" ports={doc.ports.outputs} />
            </DocSection>
            {doc.fields.length > 0 && (
                <DocSection heading={headings.section} title="Campos">
                    <NodeDocFields fields={doc.fields} />
                </DocSection>
            )}
            {doc.examples.length > 0 && (
                <DocSection heading={headings.section} title="Exemplos">
                    {doc.examples.map((example) => (
                        <Example key={example.title} heading={headings.item} example={example} />
                    ))}
                </DocSection>
            )}
            <BulletSection heading={headings.section} title="Erros comuns" lines={doc.pitfalls} />
            {doc.related.length > 0 && (
                <DocSection heading={headings.section} title="Relacionados">
                    <RelatedLinks related={doc.related} />
                </DocSection>
            )}
        </article>
    );
}

function DocSection({
    heading: HeadingTag,
    title,
    children,
}: {
    heading: HeadingTag;
    title: string;
    children: ReactNode;
}): JSX.Element {
    return (
        <section className="flex flex-col gap-2">
            <HeadingTag className="font-condensed text-lg font-semibold">{title}</HeadingTag>
            {children}
        </section>
    );
}

function BulletSection({
    heading,
    title,
    lines,
}: {
    heading: HeadingTag;
    title: string;
    lines: string[];
}): JSX.Element | null {
    if (lines.length === 0) {
        return null;
    }

    return (
        <DocSection heading={heading} title={title}>
            <ul className="flex list-disc flex-col gap-1 pl-5">
                {lines.map((line) => (
                    <li key={line}>{line}</li>
                ))}
            </ul>
        </DocSection>
    );
}

function Example({
    heading: HeadingTag,
    example,
}: {
    heading: HeadingTag;
    example: NodeExample;
}): JSX.Element {
    return (
        <div className="flex flex-col gap-1">
            <HeadingTag className="font-medium">{example.title}</HeadingTag>
            <p>{example.description}</p>
            {example.config && (
                <pre className="overflow-x-auto rounded-sm bg-canvas p-3 font-mono text-xs">
                    {JSON.stringify(example.config, null, JSON_INDENT_SPACES)}
                </pre>
            )}
        </div>
    );
}

function RelatedLinks({ related }: { related: DocumentedType[] }): JSX.Element {
    return (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {related.map((type) => (
                <li key={type}>
                    <Link to={nodeDocPath(type)} className="text-accent hover:underline">
                        {getNodeDoc(type).title}
                    </Link>
                </li>
            ))}
        </ul>
    );
}
