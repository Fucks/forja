import { Construction } from "lucide-react";
import type { JSX } from "react";

import { PageTitle } from "@/web/app/page_title.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";

export function PlaceholderPage({ title }: { title: string }): JSX.Element {
    return (
        <div className="flex flex-col gap-4">
            <PageTitle>{title}</PageTitle>
            <EmptyState
                icon={Construction}
                title="Em construção"
                description="Esta área ainda não foi implementada."
            />
        </div>
    );
}
