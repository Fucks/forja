import type { JSX } from "react";

import type { CredentialSummary } from "@/shared/credential_types.js";
import { useRemoveCredential } from "@/web/app/settings/use_credentials.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";

export function RemoveCredentialDialog({
    credential,
    onClose,
}: {
    credential: CredentialSummary;
    onClose: () => void;
}): JSX.Element {
    const removeCredential = useRemoveCredential();

    const confirmRemoval = (): void => {
        removeCredential.mutate(credential.id, { onSuccess: onClose });
    };

    return (
        <Dialog
            open
            onOpenChange={onClose}
            title="Remover credencial"
            description={`A credencial ${credential.name} será apagada do cofre. Fluxos que a usam deixam de funcionar.`}
        >
            {removeCredential.error && (
                <p role="alert" className="text-xs text-status-failed">
                    {removeCredential.error.message}
                </p>
            )}
            <footer className="flex justify-end gap-2">
                <Button onClick={onClose}>Cancelar</Button>
                <Button
                    variant="danger"
                    loading={removeCredential.isPending}
                    onClick={confirmRemoval}
                >
                    Remover
                </Button>
            </footer>
        </Dialog>
    );
}
