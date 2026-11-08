import { FolderGit2, Plus } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";
import { Link, useNavigate } from "react-router";

import type { Project } from "@/shared/project_types.js";
import { PageTitle } from "@/web/app/page_title.js";
import { NewProjectDialog } from "@/web/app/projects/new_project_dialog.js";
import { useProjects } from "@/web/app/projects/use_projects.js";
import { Button } from "@/web/components/ui/button.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { projectPath } from "@/web/config/navigation.js";

export function ProjectsPage(): JSX.Element {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const navigate = useNavigate();
    const openDialog = (): void => setIsDialogOpen(true);

    const openCreatedProject = (project: Project): void => {
        setIsDialogOpen(false);
        void navigate(projectPath(project.id));
    };

    return (
        <div className="flex flex-col gap-4">
            <PageTitle>Projetos</PageTitle>
            <ProjectsContent onNewProject={openDialog} />
            <NewProjectDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                onCreated={openCreatedProject}
            />
        </div>
    );
}

function ProjectsContent({ onNewProject }: { onNewProject: () => void }): JSX.Element {
    const projectsQuery = useProjects();

    if (projectsQuery.isPending) {
        return <Skeleton className="h-24" />;
    }
    if (projectsQuery.isError) {
        return <p role="alert">Não foi possível carregar os projetos.</p>;
    }
    if (projectsQuery.data.length === 0) {
        return (
            <EmptyState
                icon={FolderGit2}
                title="Nenhum projeto ainda"
                description="Cadastre um repositório git local para começar a montar fluxos."
                action={<NewProjectButton onClick={onNewProject} />}
            />
        );
    }

    return (
        <>
            <div className="flex justify-end">
                <NewProjectButton onClick={onNewProject} />
            </div>
            <ProjectsTable projects={projectsQuery.data} />
        </>
    );
}

function NewProjectButton({ onClick }: { onClick: () => void }): JSX.Element {
    return (
        <Button variant="primary" onClick={onClick}>
            <Plus aria-hidden className="size-4" />
            Novo projeto
        </Button>
    );
}

function ProjectsTable({ projects }: { projects: Project[] }): JSX.Element {
    return (
        <table className="w-full border-collapse text-left">
            <thead className="border-b border-border text-muted">
                <tr>
                    <th className="py-2 pr-4 font-medium">Nome</th>
                    <th className="py-2 pr-4 font-medium">Caminho</th>
                    <th className="py-2 pr-4 font-medium">Repositório GitHub</th>
                    <th className="py-2 font-medium">Branch base</th>
                </tr>
            </thead>
            <tbody>
                {projects.map((project) => (
                    <ProjectRow key={project.id} project={project} />
                ))}
            </tbody>
        </table>
    );
}

function ProjectRow({ project }: { project: Project }): JSX.Element {
    return (
        <tr className="border-b border-border">
            <td className="py-2 pr-4">
                <Link to={projectPath(project.id)} className="font-medium hover:text-accent">
                    {project.name}
                </Link>
            </td>
            <td className="py-2 pr-4 font-mono">{project.repoPath}</td>
            <td className="py-2 pr-4">{project.githubRepo ?? "—"}</td>
            <td className="py-2 font-mono">{project.baseBranch}</td>
        </tr>
    );
}
