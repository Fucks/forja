import { useState } from "react";
import type { FormEvent, JSX } from "react";

import type { Project } from "@/shared/project_types.js";
import { useCreateProject } from "@/web/app/projects/use_projects.js";
import type { ApiError } from "@/web/api/api_client.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";

const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_ENTITY = 422;
const REPO_PATH_ERROR_STATUSES = new Set([HTTP_CONFLICT, HTTP_UNPROCESSABLE_ENTITY]);

interface CreationFailure {
    target: "repoPathField" | "form";
    message: string;
}

export function NewProjectDialog({
    open,
    onOpenChange,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (project: Project) => void;
}): JSX.Element {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title="Novo projeto"
            description="Informe um repositório git local; o remote e a branch base são detectados."
        >
            <NewProjectForm onCreated={onCreated} onCancel={() => onOpenChange(false)} />
        </Dialog>
    );
}

function NewProjectForm({
    onCreated,
    onCancel,
}: {
    onCreated: (project: Project) => void;
    onCancel: () => void;
}): JSX.Element {
    const [name, setName] = useState("");
    const [repoPath, setRepoPath] = useState("");
    const createProject = useCreateProject();
    const failure = createProject.error ? describeCreationFailure(createProject.error) : undefined;

    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        createProject.mutate({ name, repoPath }, { onSuccess: onCreated });
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label="Nome" htmlFor="new-project-name">
                <Input required value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field
                label="Caminho do repositório"
                htmlFor="new-project-repo-path"
                hint="ex.: C:\dev\meu-repo"
                error={failure?.target === "repoPathField" ? failure.message : undefined}
            >
                <Input
                    required
                    mono
                    value={repoPath}
                    onChange={(event) => setRepoPath(event.target.value)}
                />
            </Field>
            {failure?.target === "form" && (
                <p role="alert" className="text-xs text-status-failed">
                    {failure.message}
                </p>
            )}
            <footer className="flex justify-end gap-2">
                <Button onClick={onCancel}>Cancelar</Button>
                <Button type="submit" variant="primary" loading={createProject.isPending}>
                    Criar projeto
                </Button>
            </footer>
        </form>
    );
}

function describeCreationFailure(error: ApiError): CreationFailure {
    if (REPO_PATH_ERROR_STATUSES.has(error.status)) {
        return { target: "repoPathField", message: error.message };
    }

    return { target: "form", message: "Não foi possível criar o projeto. Tente novamente." };
}
