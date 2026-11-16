import { SearchX } from "lucide-react";
import { useId, useState } from "react";
import type { JSX } from "react";
import { Link } from "react-router";

import { PageTitle } from "@/web/app/page_title.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Input } from "@/web/components/ui/input.js";
import { CONCEPTS_PATH, nodeDocPath } from "@/web/config/navigation.js";
import { ALL_NODE_DOCS } from "@/web/docs/node_docs/node_docs.js";
import { groupNodeDocsByCategory, searchNodeDocs } from "@/web/docs/node_docs_index.js";
import type { NodeDocsCategoryGroup } from "@/web/docs/node_docs_index.js";

export function NodeDocsIndexPage(): JSX.Element {
    const [query, setQuery] = useState("");
    const categoryGroups = groupNodeDocsByCategory(searchNodeDocs(ALL_NODE_DOCS, query));

    return (
        <div className="flex max-w-[72ch] flex-col gap-6">
            <header className="flex flex-col gap-1">
                <PageTitle>Documentação dos nós</PageTitle>
                <p className="text-muted">
                    O que cada nó faz e quando usar. Para entender item, porta, run, Map e Loop,
                    veja os{" "}
                    <Link to={CONCEPTS_PATH} className="text-accent hover:underline">
                        conceitos
                    </Link>
                    .
                </p>
            </header>
            <Input
                type="search"
                aria-label="Buscar nós"
                placeholder="Buscar por nome ou uso"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
            />
            <CategoryGroupList groups={categoryGroups} />
        </div>
    );
}

function CategoryGroupList({ groups }: { groups: NodeDocsCategoryGroup[] }): JSX.Element {
    if (groups.length === 0) {
        return <EmptyState icon={SearchX} title="Nenhum nó com esse termo" />;
    }

    return (
        <>
            {groups.map((group) => (
                <CategoryGroup key={group.category} group={group} />
            ))}
        </>
    );
}

function CategoryGroup({ group }: { group: NodeDocsCategoryGroup }): JSX.Element {
    const headingId = useId();

    return (
        <section aria-labelledby={headingId} className="flex flex-col gap-2">
            <h2 id={headingId} className="font-condensed text-lg font-semibold">
                {group.label}
            </h2>
            <ul className="flex flex-col gap-1">
                {group.docs.map((doc) => (
                    <li key={doc.type}>
                        <Link
                            to={nodeDocPath(doc.type)}
                            className="flex flex-col rounded-sm px-2 py-1 outline-none hover:bg-surface-raised focus-visible:bg-surface-raised"
                        >
                            <span className="font-medium">{doc.title}</span>
                            <span className="text-muted">{doc.tagline}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
