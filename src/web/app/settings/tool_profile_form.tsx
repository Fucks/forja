import { useId, useState } from "react";
import type { FormEvent, JSX } from "react";

import type { ToolProfile, ToolProfileInput } from "@/shared/tool_profile_types.js";
import { McpServersEditor } from "@/web/app/settings/mcp_servers_editor.js";
import { PermissionModeField } from "@/web/app/settings/permission_mode_field.js";
import {
    toToolProfileDraft,
    buildToolProfileInput,
} from "@/web/app/settings/tool_profile_draft.js";
import type { ToolProfileDraft } from "@/web/app/settings/tool_profile_draft.js";
import { ToolRulesInput } from "@/web/app/settings/tool_rules_input.js";
import { Button } from "@/web/components/ui/button.js";
import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";
import { Switch } from "@/web/components/ui/switch.js";
import { Textarea } from "@/web/components/ui/textarea.js";

export function ToolProfileForm({
    initialProfile,
    isSaving,
    onSave,
    onCancel,
}: {
    initialProfile?: ToolProfile;
    isSaving: boolean;
    onSave: (input: ToolProfileInput) => void;
    onCancel: () => void;
}): JSX.Element {
    const formId = useId();
    const [draft, setDraft] = useState(() => toToolProfileDraft(initialProfile));

    function changeDraft(changes: Partial<ToolProfileDraft>): void {
        setDraft((current) => ({ ...current, ...changes }));
    }

    function saveDraft(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();
        onSave(buildToolProfileInput(draft));
    }

    return (
        <form className="mt-4 flex flex-col gap-4" onSubmit={saveDraft}>
            <Field label="Nome" htmlFor={`${formId}-name`}>
                <Input
                    required
                    value={draft.name}
                    onChange={(event) => changeDraft({ name: event.target.value })}
                />
            </Field>
            <Field label="Descrição" htmlFor={`${formId}-description`}>
                <Textarea
                    value={draft.description}
                    onChange={(event) => changeDraft({ description: event.target.value })}
                />
            </Field>
            <McpServersEditor
                servers={draft.mcpServers}
                onChange={(mcpServers) => changeDraft({ mcpServers })}
            />
            <Field
                label="Ferramentas permitidas"
                hint="Enter adiciona. Ex.: Read, Bash(git log *), mcp__codegraph__*"
                htmlFor={`${formId}-allowed`}
            >
                <ToolRulesInput
                    id={`${formId}-allowed`}
                    rules={draft.allowedTools}
                    placeholder="Read"
                    onChange={(allowedTools) => changeDraft({ allowedTools })}
                />
            </Field>
            <Field
                label="Ferramentas proibidas"
                hint="Enter adiciona."
                htmlFor={`${formId}-disallowed`}
            >
                <ToolRulesInput
                    id={`${formId}-disallowed`}
                    rules={draft.disallowedTools}
                    placeholder="Write"
                    onChange={(disallowedTools) => changeDraft({ disallowedTools })}
                />
            </Field>
            <PermissionModeField
                id={`${formId}-permission-mode`}
                permissionMode={draft.permissionMode}
                onChange={(permissionMode) => changeDraft({ permissionMode })}
            />
            <Switch
                label="Indexar com o CodeGraph ao abrir o workspace"
                checked={draft.indexCodegraphOnStart}
                onChange={(indexCodegraphOnStart) => changeDraft({ indexCodegraphOnStart })}
            />
            <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={isSaving}>
                    Salvar
                </Button>
            </div>
        </form>
    );
}
