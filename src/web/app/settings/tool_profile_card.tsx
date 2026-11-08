import { Copy, Pencil, Trash2 } from "lucide-react";
import type { JSX } from "react";

import type { ToolProfile } from "@/shared/tool_profile_types.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { KeyValue } from "@/web/components/ui/key_value.js";

const NONE_LABEL = "—";
const LIST_SEPARATOR = ", ";

export interface ToolProfileActions {
    onEdit: (profile: ToolProfile) => void;
    onDuplicate: (profile: ToolProfile) => void;
    onRemove: (profile: ToolProfile) => void;
}

export function ToolProfileCard({
    profile,
    actions,
}: {
    profile: ToolProfile;
    actions: ToolProfileActions;
}): JSX.Element {
    return (
        <article
            aria-label={profile.name}
            className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4"
        >
            <header className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                    <h2 className="flex items-center gap-2 font-semibold">
                        {profile.name}
                        {profile.builtin && <BuiltinBadge />}
                    </h2>
                    {profile.description && <p className="text-muted">{profile.description}</p>}
                </div>
                <ToolProfileCardActions profile={profile} actions={actions} />
            </header>
            <KeyValue
                items={[
                    {
                        label: "MCPs",
                        value: listOrNone(profile.mcpServers.map(({ name }) => name)),
                        mono: true,
                    },
                    { label: "Permitidas", value: listOrNone(profile.allowedTools), mono: true },
                    { label: "Proibidas", value: listOrNone(profile.disallowedTools), mono: true },
                    { label: "Permissão", value: profile.permissionMode, mono: true },
                ]}
            />
        </article>
    );
}

function BuiltinBadge(): JSX.Element {
    return (
        <span className="rounded-sm border border-border px-1.5 py-0.5 text-xs font-normal text-muted">
            embutido
        </span>
    );
}

function ToolProfileCardActions({
    profile,
    actions,
}: {
    profile: ToolProfile;
    actions: ToolProfileActions;
}): JSX.Element {
    return (
        <div className="flex shrink-0 gap-1">
            {!profile.builtin && (
                <IconButton
                    label={`Editar ${profile.name}`}
                    icon={Pencil}
                    onClick={() => actions.onEdit(profile)}
                />
            )}
            <IconButton
                label={`Duplicar ${profile.name}`}
                icon={Copy}
                onClick={() => actions.onDuplicate(profile)}
            />
            {!profile.builtin && (
                <IconButton
                    label={`Remover ${profile.name}`}
                    icon={Trash2}
                    onClick={() => actions.onRemove(profile)}
                />
            )}
        </div>
    );
}

function listOrNone(entries: string[]): string {
    return entries.length > 0 ? entries.join(LIST_SEPARATOR) : NONE_LABEL;
}
