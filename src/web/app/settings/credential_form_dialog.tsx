import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { FormEvent, JSX, ReactNode } from "react";

import { CREDENTIAL_NAME_MAX_LENGTH } from "@/shared/credential_types.js";
import type {
    CredentialInput,
    CredentialKind,
    CredentialSummary,
    UpdateCredentialInput,
} from "@/shared/credential_types.js";
import {
    CREDENTIAL_KIND_HELP,
    CREDENTIAL_KIND_OPTIONS,
} from "@/web/app/settings/credential_kinds.js";
import { useCreateCredential, useUpdateCredential } from "@/web/app/settings/use_credentials.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { Field } from "@/web/components/ui/field.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { Input } from "@/web/components/ui/input.js";
import { Select } from "@/web/components/ui/select.js";

export type CredentialEditor =
    { mode: "closed" } | { mode: "create" } | { mode: "edit"; credential: CredentialSummary };

const DEFAULT_KIND: CredentialKind = "anthropic_api_key";
const KEEP_CURRENT_VALUE_HINT = "Deixe em branco para manter o valor atual.";
const ENV_VAR_HINT = "Letras maiúsculas, números e _ (ex.: SENTRY_TOKEN).";

export function CredentialFormDialog({
    editor,
    onClose,
}: {
    editor: CredentialEditor;
    onClose: () => void;
}): JSX.Element {
    const editedCredential = editor.mode === "edit" ? editor.credential : undefined;

    return (
        <Dialog
            open={editor.mode !== "closed"}
            onOpenChange={onClose}
            title={editedCredential ? "Editar credencial" : "Nova credencial"}
            description="O valor é cifrado ao salvar e nunca é exibido de novo."
        >
            {editedCredential ? (
                <EditCredentialForm credential={editedCredential} onDone={onClose} />
            ) : (
                <CreateCredentialForm onDone={onClose} />
            )}
        </Dialog>
    );
}

function CreateCredentialForm({ onDone }: { onDone: () => void }): JSX.Element {
    const [name, setName] = useState("");
    const [kind, setKind] = useState<CredentialKind>(DEFAULT_KIND);
    const [envVar, setEnvVar] = useState("");
    const [value, setValue] = useState("");
    const createCredential = useCreateCredential();

    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        createCredential.mutate(buildCredentialInput({ name, kind, envVar, value }), {
            onSuccess: onDone,
        });
    };

    return (
        <CredentialForm onSubmit={submit} onCancel={onDone} saving={createCredential}>
            <NameField id="credential-name" name={name} onChange={setName} />
            <Field label="Tipo" htmlFor="credential-kind">
                <Select value={kind} onChange={setKind} options={CREDENTIAL_KIND_OPTIONS} />
            </Field>
            {kind === "generic_env" && (
                <Field
                    label="Variável de ambiente"
                    htmlFor="credential-env-var"
                    hint={ENV_VAR_HINT}
                >
                    <Input
                        required
                        mono
                        value={envVar}
                        onChange={(event) => setEnvVar(event.target.value)}
                    />
                </Field>
            )}
            <SecretValueField
                id="credential-value"
                label="Valor"
                hint={CREDENTIAL_KIND_HELP[kind]}
                value={value}
                onChange={setValue}
                required
            />
        </CredentialForm>
    );
}

function EditCredentialForm({
    credential,
    onDone,
}: {
    credential: CredentialSummary;
    onDone: () => void;
}): JSX.Element {
    const [name, setName] = useState(credential.name);
    const [newValue, setNewValue] = useState("");
    const updateCredential = useUpdateCredential();

    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        updateCredential.mutate(
            { id: credential.id, changes: buildCredentialChanges(name, newValue) },
            { onSuccess: onDone },
        );
    };

    return (
        <CredentialForm onSubmit={submit} onCancel={onDone} saving={updateCredential}>
            <NameField id="credential-name" name={name} onChange={setName} />
            <SecretValueField
                id="credential-new-value"
                label="Novo valor"
                hint={`${KEEP_CURRENT_VALUE_HINT} ${CREDENTIAL_KIND_HELP[credential.kind]}`}
                value={newValue}
                onChange={setNewValue}
            />
        </CredentialForm>
    );
}

function CredentialForm({
    onSubmit,
    onCancel,
    saving,
    children,
}: {
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onCancel: () => void;
    saving: { isPending: boolean; error: Error | null };
    children: ReactNode;
}): JSX.Element {
    return (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
            {children}
            {saving.error && (
                <p role="alert" className="text-xs text-status-failed">
                    {saving.error.message}
                </p>
            )}
            <footer className="flex justify-end gap-2">
                <Button onClick={onCancel}>Cancelar</Button>
                <Button type="submit" variant="primary" loading={saving.isPending}>
                    Salvar
                </Button>
            </footer>
        </form>
    );
}

function NameField({
    id,
    name,
    onChange,
}: {
    id: string;
    name: string;
    onChange: (name: string) => void;
}): JSX.Element {
    return (
        <Field label="Nome" htmlFor={id}>
            <Input
                required
                maxLength={CREDENTIAL_NAME_MAX_LENGTH}
                value={name}
                onChange={(event) => onChange(event.target.value)}
            />
        </Field>
    );
}

function SecretValueField({
    id,
    label,
    hint,
    value,
    onChange,
    required = false,
}: {
    id: string;
    label: string;
    hint: string;
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
}): JSX.Element {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <Field label={label} htmlFor={id} hint={hint}>
            <div className="flex gap-1">
                <Input
                    mono
                    required={required}
                    type={isVisible ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                />
                <IconButton
                    label="Mostrar enquanto digito"
                    icon={isVisible ? EyeOff : Eye}
                    aria-pressed={isVisible}
                    onClick={() => setIsVisible(!isVisible)}
                />
            </div>
        </Field>
    );
}

function buildCredentialInput(draft: {
    name: string;
    kind: CredentialKind;
    envVar: string;
    value: string;
}): CredentialInput {
    const { name, kind, envVar, value } = draft;
    if (kind !== "generic_env") {
        return { name, kind, value };
    }

    return { name, kind, value, envVar };
}

function buildCredentialChanges(name: string, newValue: string): UpdateCredentialInput {
    if (newValue === "") {
        return { name };
    }

    return { name, value: newValue };
}
