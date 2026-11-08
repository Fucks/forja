import type { JSX } from "react";
import { useParams } from "react-router";

import { PageTitle } from "@/web/app/page_title.js";
import { useProject } from "@/web/app/projects/use_projects.js";

export function ProjectPage(): JSX.Element {
    const { projectId = "" } = useParams();
    const projectQuery = useProject(projectId);

    return <PageTitle>{projectQuery.data?.name ?? "Projeto"}</PageTitle>;
}
