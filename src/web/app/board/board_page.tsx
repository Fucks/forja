import type { JSX } from "react";
import { useParams } from "react-router";

import { PageTitle } from "@/web/app/page_title.js";
import { ProjectBoard } from "@/web/board/board_view.js";

export function BoardPage(): JSX.Element {
    const { projectId = "" } = useParams();

    return (
        <div className="flex h-full flex-col gap-4">
            <PageTitle>Board</PageTitle>
            <ProjectBoard projectId={projectId} />
        </div>
    );
}
