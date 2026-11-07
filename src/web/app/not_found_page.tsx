import { Compass } from "lucide-react";
import type { JSX } from "react";
import { Link } from "react-router";

import { PageTitle } from "@/web/app/page_title.js";
import { Button } from "@/web/components/ui/button.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { PROJECTS_PATH } from "@/web/config/navigation.js";

export function NotFoundPage(): JSX.Element {
    return (
        <div className="flex flex-col gap-4">
            <PageTitle>Página não encontrada</PageTitle>
            <EmptyState
                icon={Compass}
                title="Nada por aqui"
                description="O endereço não corresponde a nenhuma página da Forja."
                action={
                    <Button asChild variant="primary">
                        <Link to={PROJECTS_PATH}>Voltar para os projetos</Link>
                    </Button>
                }
            />
        </div>
    );
}
