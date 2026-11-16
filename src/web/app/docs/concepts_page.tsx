import { useId } from "react";
import type { JSX } from "react";
import { Link } from "react-router";

import { PORT_TYPES } from "@/shared/flow_graph.js";
import type { PortType } from "@/shared/flow_graph.js";
import { PageTitle } from "@/web/app/page_title.js";
import { PORT_TYPE_ICONS, PORT_TYPE_LABELS } from "@/web/canvas/base/port_type_icons.js";
import { NODE_DOCS_PATH } from "@/web/config/navigation.js";
import { CONCEPTS, PORT_TYPES_CONCEPT_ID } from "@/web/docs/concepts.js";
import type { Concept } from "@/web/docs/concepts.js";

export function ConceptsPage(): JSX.Element {
    return (
        <div className="flex max-w-[72ch] flex-col gap-6">
            <header className="flex flex-col gap-1">
                <PageTitle>Conceitos</PageTitle>
                <p className="text-muted">
                    As ideias por trás dos fluxos. Para o que cada nó faz, veja a{" "}
                    <Link to={NODE_DOCS_PATH} className="text-accent hover:underline">
                        documentação dos nós
                    </Link>
                    .
                </p>
            </header>
            {CONCEPTS.map((concept) => (
                <ConceptSection key={concept.id} concept={concept} />
            ))}
        </div>
    );
}

function ConceptSection({ concept }: { concept: Concept }): JSX.Element {
    const headingId = useId();

    return (
        <section aria-labelledby={headingId} className="flex flex-col gap-2">
            <h2 id={headingId} className="font-condensed text-lg font-semibold">
                {concept.title}
            </h2>
            {concept.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
            ))}
            {concept.id === PORT_TYPES_CONCEPT_ID && <PortTypeList />}
        </section>
    );
}

function PortTypeList(): JSX.Element {
    return (
        <ul aria-label="Tipos de porta" className="flex flex-col gap-1">
            {PORT_TYPES.map((portType) => (
                <PortTypeItem key={portType} portType={portType} />
            ))}
        </ul>
    );
}

function PortTypeItem({ portType }: { portType: PortType }): JSX.Element {
    const Icon = PORT_TYPE_ICONS[portType];

    return (
        <li className="flex items-center gap-2">
            <Icon aria-hidden className="size-4 shrink-0 text-muted" />
            <span>{PORT_TYPE_LABELS[portType]}</span>
            <code className="font-mono text-xs text-muted">{portType}</code>
        </li>
    );
}
