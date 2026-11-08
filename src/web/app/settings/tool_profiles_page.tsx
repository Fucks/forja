import { CircleAlert, Plus } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";

import type { ToolProfile, ToolProfileInput } from "@/shared/tool_profile_types.js";
import { PageTitle } from "@/web/app/page_title.js";
import { ToolProfileCard } from "@/web/app/settings/tool_profile_card.js";
import type { ToolProfileActions } from "@/web/app/settings/tool_profile_card.js";
import { ToolProfileForm } from "@/web/app/settings/tool_profile_form.js";
import {
    useCreateToolProfile,
    useDuplicateToolProfile,
    useRemoveToolProfile,
    useToolProfiles,
    useUpdateToolProfile,
} from "@/web/app/settings/use_tool_profiles.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { useToast } from "@/web/components/ui/toast.js";

type ToolProfileEditor =
    { mode: "closed" } | { mode: "create" } | { mode: "edit"; profile: ToolProfile };

const CLOSED_EDITOR: ToolProfileEditor = { mode: "closed" };
const NEW_PROFILE_FORM_KEY = "new";

export function ToolProfilesPage(): JSX.Element {
    const [editor, setEditor] = useState<ToolProfileEditor>(CLOSED_EDITOR);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
                <PageTitle>Perfis de ferramentas</PageTitle>
                <Button variant="primary" onClick={() => setEditor({ mode: "create" })}>
                    <Plus aria-hidden className="size-3.5" />
                    Novo perfil
                </Button>
            </div>
            <ToolProfileList onEdit={(profile) => setEditor({ mode: "edit", profile })} />
            <ToolProfileEditorDialog editor={editor} onClose={() => setEditor(CLOSED_EDITOR)} />
        </div>
    );
}

function ToolProfileList({ onEdit }: { onEdit: (profile: ToolProfile) => void }): JSX.Element {
    const profilesQuery = useToolProfiles();
    const actions = useToolProfileActions(onEdit);

    if (profilesQuery.isPending) {
        return <Skeleton className="h-32" />;
    }
    if (profilesQuery.isError) {
        return (
            <EmptyState
                icon={CircleAlert}
                title="Não foi possível carregar os perfis"
                description={profilesQuery.error.message}
            />
        );
    }

    return (
        <div className="grid gap-3 lg:grid-cols-2">
            {profilesQuery.data.map((profile) => (
                <ToolProfileCard key={profile.id} profile={profile} actions={actions} />
            ))}
        </div>
    );
}

function useToolProfileActions(onEdit: (profile: ToolProfile) => void): ToolProfileActions {
    const duplicateProfile = useDuplicateToolProfile();
    const removeProfile = useRemoveToolProfile();
    const showFailure = useFailureToast();

    return {
        onEdit,
        onDuplicate: (profile) =>
            duplicateProfile.mutate(profile.id, {
                onError: (error) => showFailure("Não foi possível duplicar o perfil", error),
            }),
        onRemove: (profile) =>
            removeProfile.mutate(profile.id, {
                onError: (error) => showFailure("Não foi possível remover o perfil", error),
            }),
    };
}

function ToolProfileEditorDialog({
    editor,
    onClose,
}: {
    editor: ToolProfileEditor;
    onClose: () => void;
}): JSX.Element {
    const createProfile = useCreateToolProfile();
    const updateProfile = useUpdateToolProfile();
    const showFailure = useFailureToast();
    const editedProfile = editor.mode === "edit" ? editor.profile : undefined;

    function saveProfile(input: ToolProfileInput): void {
        const afterSaving = {
            onSuccess: onClose,
            onError: (error: Error) => showFailure("Não foi possível salvar o perfil", error),
        };
        if (editedProfile) {
            updateProfile.mutate({ id: editedProfile.id, input }, afterSaving);
            return;
        }
        createProfile.mutate(input, afterSaving);
    }

    return (
        <Dialog
            open={editor.mode !== "closed"}
            onOpenChange={onClose}
            title={editedProfile ? "Editar perfil" : "Novo perfil"}
        >
            <ToolProfileForm
                key={editedProfile?.id ?? NEW_PROFILE_FORM_KEY}
                initialProfile={editedProfile}
                isSaving={createProfile.isPending || updateProfile.isPending}
                onSave={saveProfile}
                onCancel={onClose}
            />
        </Dialog>
    );
}

function useFailureToast(): (title: string, error: Error) => void {
    const toast = useToast();

    return (title, error) => toast.show({ tone: "error", title, description: error.message });
}
