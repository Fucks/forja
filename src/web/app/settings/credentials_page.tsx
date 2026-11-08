import { CircleAlert, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { JSX } from "react";

import { formatDateTime } from "@/lib/format.js";
import type { CredentialSummary } from "@/shared/credential_types.js";
import { PageTitle } from "@/web/app/page_title.js";
import { CredentialFormDialog } from "@/web/app/settings/credential_form_dialog.js";
import type { CredentialEditor } from "@/web/app/settings/credential_form_dialog.js";
import { CREDENTIAL_KIND_LABELS } from "@/web/app/settings/credential_kinds.js";
import { RemoveCredentialDialog } from "@/web/app/settings/remove_credential_dialog.js";
import { useCredentials } from "@/web/app/settings/use_credentials.js";
import { Button } from "@/web/components/ui/button.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";

interface CredentialActions {
    onEdit: (credential: CredentialSummary) => void;
    onRemove: (credential: CredentialSummary) => void;
}

const CLOSED_EDITOR: CredentialEditor = { mode: "closed" };

export function CredentialsPage(): JSX.Element {
    const [editor, setEditor] = useState<CredentialEditor>(CLOSED_EDITOR);
    const [pendingRemoval, setPendingRemoval] = useState<CredentialSummary>();

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
                <PageTitle>Credenciais</PageTitle>
                <Button variant="primary" onClick={() => setEditor({ mode: "create" })}>
                    <Plus aria-hidden className="size-3.5" />
                    Nova credencial
                </Button>
            </div>
            <CredentialsContent
                actions={{
                    onEdit: (credential) => setEditor({ mode: "edit", credential }),
                    onRemove: setPendingRemoval,
                }}
            />
            <CredentialFormDialog editor={editor} onClose={() => setEditor(CLOSED_EDITOR)} />
            {pendingRemoval && (
                <RemoveCredentialDialog
                    credential={pendingRemoval}
                    onClose={() => setPendingRemoval(undefined)}
                />
            )}
        </div>
    );
}

function CredentialsContent({ actions }: { actions: CredentialActions }): JSX.Element {
    const credentialsQuery = useCredentials();

    if (credentialsQuery.isPending) {
        return <Skeleton className="h-24" />;
    }
    if (credentialsQuery.isError) {
        return (
            <EmptyState
                icon={CircleAlert}
                title="Não foi possível carregar as credenciais"
                description={credentialsQuery.error.message}
            />
        );
    }
    if (credentialsQuery.data.length === 0) {
        return (
            <EmptyState
                icon={KeyRound}
                title="Nenhuma credencial ainda"
                description="Cadastre a credencial do Claude para rodar agentes e um token do GitHub para abrir PRs."
            />
        );
    }

    return <CredentialsTable credentials={credentialsQuery.data} actions={actions} />;
}

function CredentialsTable({
    credentials,
    actions,
}: {
    credentials: CredentialSummary[];
    actions: CredentialActions;
}): JSX.Element {
    return (
        <table className="w-full border-collapse text-left">
            <thead className="border-b border-border text-muted">
                <tr>
                    <th className="py-2 pr-4 font-medium">Nome</th>
                    <th className="py-2 pr-4 font-medium">Tipo</th>
                    <th className="py-2 pr-4 font-medium">Valor</th>
                    <th className="py-2 pr-4 font-medium">Variável de ambiente</th>
                    <th className="py-2 pr-4 font-medium">Último teste</th>
                    <th className="py-2 font-medium">
                        <span className="sr-only">Ações</span>
                    </th>
                </tr>
            </thead>
            <tbody>
                {credentials.map((credential) => (
                    <CredentialRow key={credential.id} credential={credential} actions={actions} />
                ))}
            </tbody>
        </table>
    );
}

function CredentialRow({
    credential,
    actions,
}: {
    credential: CredentialSummary;
    actions: CredentialActions;
}): JSX.Element {
    return (
        <tr className="border-b border-border">
            <td className="py-2 pr-4 font-medium">{credential.name}</td>
            <td className="py-2 pr-4">{CREDENTIAL_KIND_LABELS[credential.kind]}</td>
            <td className="py-2 pr-4 font-mono">{credential.masked}</td>
            <td className="py-2 pr-4 font-mono">{credential.envVar}</td>
            <td className="py-2 pr-4">{describeLastCheck(credential)}</td>
            <td className="py-2">
                <div className="flex justify-end gap-1">
                    <IconButton
                        label={`Editar ${credential.name}`}
                        icon={Pencil}
                        onClick={() => actions.onEdit(credential)}
                    />
                    <IconButton
                        label={`Remover ${credential.name}`}
                        icon={Trash2}
                        onClick={() => actions.onRemove(credential)}
                    />
                </div>
            </td>
        </tr>
    );
}

function describeLastCheck({ lastCheckedAt, lastCheckOk }: CredentialSummary): string {
    if (lastCheckedAt === undefined) {
        return "Nunca testada";
    }

    const checkedAt = formatDateTime(new Date(lastCheckedAt));
    return lastCheckOk ? `OK · ${checkedAt}` : `Falhou · ${checkedAt}`;
}
