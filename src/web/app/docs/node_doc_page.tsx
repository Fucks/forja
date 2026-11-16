import { SearchX } from "lucide-react";
import type { JSX } from "react";
import { Link, useParams } from "react-router";

import { PageTitle } from "@/web/app/page_title.js";
import { Button } from "@/web/components/ui/button.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { NODE_DOCS_PATH } from "@/web/config/navigation.js";
import { NodeDocView } from "@/web/docs/node_doc_view.js";
import { findNodeDoc } from "@/web/docs/node_docs/node_docs.js";

export function NodeDocPage(): JSX.Element {
    const { type = "" } = useParams();
    const doc = findNodeDoc(type);
    if (!doc) {
        return <NodeDocNotFound />;
    }

    return (
        <div className="flex flex-col gap-4">
            <Link to={NODE_DOCS_PATH} className="text-muted hover:text-text">
                Todos os nós
            </Link>
            <NodeDocView doc={doc} placement="page" />
        </div>
    );
}

function NodeDocNotFound(): JSX.Element {
    return (
        <div className="flex flex-col gap-4">
            <PageTitle>Nó não encontrado</PageTitle>
            <EmptyState
                icon={SearchX}
                title="Nenhum nó com esse tipo"
                description="O endereço não corresponde a nenhum nó documentado."
                action={
                    <Button asChild variant="primary">
                        <Link to={NODE_DOCS_PATH}>Ver todos os nós</Link>
                    </Button>
                }
            />
        </div>
    );
}
