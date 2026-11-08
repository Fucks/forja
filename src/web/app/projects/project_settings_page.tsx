import { useState } from "react";
import type { JSX, ReactNode } from "react";
import { useParams } from "react-router";

import type { GlobalSettings, ProjectSettings } from "@/shared/settings_types.js";
import { PageTitle } from "@/web/app/page_title.js";
import { GlobalSettingsForm } from "@/web/app/projects/global_settings_form.js";
import { ProjectSettingsForm } from "@/web/app/projects/project_settings_form.js";
import {
    buildGlobalSettings,
    buildProjectSettings,
    toGlobalSettingsDraft,
    toProjectSettingsDraft,
} from "@/web/app/projects/settings_draft.js";
import type {
    GlobalSettingsDraft,
    ProjectSettingsDraft,
} from "@/web/app/projects/settings_draft.js";
import {
    useGlobalSettings,
    useProjectSettings,
    useSaveSettings,
} from "@/web/app/projects/use_settings.js";
import { Button } from "@/web/components/ui/button.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { useToast } from "@/web/components/ui/toast.js";

export function ProjectSettingsPage(): JSX.Element {
    const { projectId = "" } = useParams();
    const projectSettingsQuery = useProjectSettings(projectId);
    const globalSettingsQuery = useGlobalSettings();

    if (projectSettingsQuery.isError || globalSettingsQuery.isError) {
        return (
            <SettingsPageLayout>
                <p role="alert">Não foi possível carregar as configurações.</p>
            </SettingsPageLayout>
        );
    }
    if (projectSettingsQuery.isPending || globalSettingsQuery.isPending) {
        return (
            <SettingsPageLayout>
                <Skeleton className="h-64" />
            </SettingsPageLayout>
        );
    }

    return (
        <SettingsEditor
            projectId={projectId}
            savedProjectSettings={projectSettingsQuery.data}
            savedGlobalSettings={globalSettingsQuery.data}
        />
    );
}

function SettingsPageLayout({ children }: { children: ReactNode }): JSX.Element {
    return (
        <div className="flex flex-col gap-8 pb-20">
            <PageTitle>Configurações do projeto</PageTitle>
            {children}
        </div>
    );
}

// A draft is undefined while its level has no changes, so the form shows the saved values.
function SettingsEditor({
    projectId,
    savedProjectSettings,
    savedGlobalSettings,
}: {
    projectId: string;
    savedProjectSettings: ProjectSettings;
    savedGlobalSettings: GlobalSettings;
}): JSX.Element {
    const [projectDraft, setProjectDraft] = useState<ProjectSettingsDraft>();
    const [globalDraft, setGlobalDraft] = useState<GlobalSettingsDraft>();
    const saveSettings = useSaveSettings(projectId);
    const toast = useToast();
    const hasChanges = projectDraft !== undefined || globalDraft !== undefined;

    function clearDrafts(): void {
        setProjectDraft(undefined);
        setGlobalDraft(undefined);
        saveSettings.reset();
    }

    function saveDrafts(): void {
        const changes = {
            project: projectDraft && buildProjectSettings(projectDraft),
            global: globalDraft && buildGlobalSettings(globalDraft),
        };
        saveSettings.mutate(changes, {
            onSuccess: () => {
                clearDrafts();
                toast.show({ title: "Configurações salvas", tone: "success" });
            },
        });
    }

    return (
        <SettingsPageLayout>
            <ProjectSettingsForm
                draft={projectDraft ?? toProjectSettingsDraft(savedProjectSettings)}
                onChange={setProjectDraft}
            />
            <GlobalSettingsForm
                draft={globalDraft ?? toGlobalSettingsDraft(savedGlobalSettings)}
                onChange={setGlobalDraft}
            />
            {hasChanges && (
                <SaveBar
                    isSaving={saveSettings.isPending}
                    errorMessage={saveSettings.error?.message}
                    onSave={saveDrafts}
                    onDiscard={clearDrafts}
                />
            )}
        </SettingsPageLayout>
    );
}

function SaveBar({
    isSaving,
    errorMessage,
    onSave,
    onDiscard,
}: {
    isSaving: boolean;
    errorMessage: string | undefined;
    onSave: () => void;
    onDiscard: () => void;
}): JSX.Element {
    return (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-end gap-3 border-t border-border bg-surface-raised px-6 py-3">
            {errorMessage && (
                <p role="alert" className="mr-auto text-sm text-status-failed">
                    {errorMessage}
                </p>
            )}
            <span className="text-sm text-muted">Alterações não salvas</span>
            <Button variant="ghost" disabled={isSaving} onClick={onDiscard}>
                Descartar
            </Button>
            <Button variant="primary" loading={isSaving} onClick={onSave}>
                Salvar
            </Button>
        </div>
    );
}
