import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";
import { Link, useParams } from "react-router";

import type { Project } from "@/shared/project_types.js";
import { PageTitle } from "@/web/app/page_title.js";
import { DetectedList, NextStepHints } from "@/web/app/projects/project_detections.js";
import { useProject } from "@/web/app/projects/use_projects.js";
import { KeyValue } from "@/web/components/ui/key_value.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { PROJECT_NAV } from "@/web/config/navigation.js";

const PROJECT_TITLE_FALLBACK = "Projeto";

const SHORTCUT_DESCRIPTIONS = new Map([
    ["flows", "Desenhe a linha de montagem de agentes."],
    ["board", "Acompanhe as issues em cada etapa."],
    ["runs", "Veja as execuções e seus logs."],
]);

interface ProjectShortcut {
    label: string;
    description: string;
    icon: LucideIcon;
    path: string;
}

export function ProjectPage(): JSX.Element {
    const { projectId = "" } = useParams();
    const projectQuery = useProject(projectId);

    if (projectQuery.isPending) {
        return (
            <div className="flex flex-col gap-4">
                <PageTitle>{PROJECT_TITLE_FALLBACK}</PageTitle>
                <Skeleton className="h-24" />
            </div>
        );
    }
    if (projectQuery.isError) {
        return (
            <div className="flex flex-col gap-4">
                <PageTitle>{PROJECT_TITLE_FALLBACK}</PageTitle>
                <p role="alert">Não foi possível carregar o projeto.</p>
            </div>
        );
    }

    return <ProjectOverview project={projectQuery.data} />;
}

function ProjectOverview({ project }: { project: Project }): JSX.Element {
    return (
        <div className="flex flex-col gap-6">
            <PageTitle>{project.name}</PageTitle>
            <KeyValue
                items={[
                    { label: "Caminho", value: project.repoPath, mono: true },
                    { label: "Branch base", value: project.baseBranch, mono: true },
                    { label: "GitHub", value: project.githubRepo ?? "Sem remote no GitHub" },
                    { label: "Detectado", value: <DetectedList detection={project.detected} /> },
                ]}
            />
            <NextStepHints detection={project.detected} />
            <ProjectShortcuts projectId={project.id} />
        </div>
    );
}

function ProjectShortcuts({ projectId }: { projectId: string }): JSX.Element {
    return (
        <nav aria-label="Atalhos do projeto" className="grid gap-3 sm:grid-cols-3">
            {listProjectShortcuts(projectId).map((shortcut) => (
                <ShortcutCard key={shortcut.path} shortcut={shortcut} />
            ))}
        </nav>
    );
}

function listProjectShortcuts(projectId: string): ProjectShortcut[] {
    return PROJECT_NAV.flatMap((area) => {
        const description = SHORTCUT_DESCRIPTIONS.get(area.id);
        if (!description) {
            return [];
        }

        return [{ label: area.label, description, icon: area.icon, path: area.path(projectId) }];
    });
}

function ShortcutCard({ shortcut }: { shortcut: ProjectShortcut }): JSX.Element {
    const { label, description, icon: Icon, path } = shortcut;

    return (
        <Link
            to={path}
            className="flex flex-col gap-1 rounded-md border border-border bg-surface p-4 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
            <span className="inline-flex items-center gap-2 font-medium">
                <Icon aria-hidden className="size-4" />
                {label}
            </span>
            <span className="text-muted">{description}</span>
        </Link>
    );
}
