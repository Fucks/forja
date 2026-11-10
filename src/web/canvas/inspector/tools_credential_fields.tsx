import type { JSX } from "react";

import { AGENT_CREDENTIAL_KINDS } from "@/shared/credential_types.js";
import { useCredentials } from "@/web/app/settings/use_credentials.js";
import { useToolProfiles } from "@/web/app/settings/use_tool_profiles.js";
import { InheritableSelect } from "@/web/canvas/inspector/inheritable_select.js";

interface NamedEntry {
    id: string;
    name: string;
}

const NO_CREDENTIAL_LABEL = "nenhuma";

export function ToolProfileField({
    toolProfileId,
    inheritedToolProfileId,
    onChange,
}: {
    toolProfileId: string | undefined;
    inheritedToolProfileId: string | undefined;
    onChange: (toolProfileId: string | undefined) => void;
}): JSX.Element {
    const toolProfiles = useToolProfiles().data ?? [];

    return (
        <InheritableSelect
            label="Perfil de ferramentas"
            selected={toolProfileId}
            options={toolProfiles.map(toOption)}
            inheritedLabel={describeEntry(toolProfiles, inheritedToolProfileId)}
            onChange={onChange}
        />
    );
}

export function CredentialField({
    credentialId,
    inheritedCredentialId,
    onChange,
}: {
    credentialId: string | undefined;
    inheritedCredentialId: string | null | undefined;
    onChange: (credentialId: string | undefined) => void;
}): JSX.Element {
    const agentCredentials = (useCredentials().data ?? []).filter((credential) =>
        AGENT_CREDENTIAL_KINDS.includes(credential.kind),
    );
    const inheritedLabel =
        inheritedCredentialId === null
            ? NO_CREDENTIAL_LABEL
            : describeEntry(agentCredentials, inheritedCredentialId);

    return (
        <InheritableSelect
            label="Credencial"
            selected={credentialId}
            options={agentCredentials.map(toOption)}
            inheritedLabel={inheritedLabel}
            onChange={onChange}
        />
    );
}

function toOption(entry: NamedEntry): { value: string; label: string } {
    return { value: entry.id, label: entry.name };
}

function describeEntry(entries: NamedEntry[], id: string | undefined): string | undefined {
    if (id === undefined) {
        return undefined;
    }

    return entries.find((entry) => entry.id === id)?.name ?? id;
}
