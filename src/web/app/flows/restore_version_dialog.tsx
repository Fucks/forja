import type { JSX } from "react";

import { useRestoreVersion } from "@/web/app/flows/use_flow_versions.js";
import { versionLabel } from "@/web/app/flows/use_version_comparison.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { useToast } from "@/web/components/ui/toast.js";

export function RestoreVersionDialog({
    flowId,
    version,
    onClose,
}: {
    flowId: string;
    version: number;
    onClose: () => void;
}): JSX.Element {
    const restoreVersion = useRestoreVersion(flowId);
    const toast = useToast();
    const label = versionLabel(version);

    const confirmRestore = (): void => {
        restoreVersion.mutate(version, {
            onSuccess: () => {
                toast.show({ title: `${label} restaurada no rascunho`, tone: "success" });
                onClose();
            },
        });
    };

    return (
        <Dialog
            open
            onOpenChange={onClose}
            title={`Restaurar ${label}`}
            description={`A ${label} substitui o rascunho atual. As alterações do rascunho que não foram publicadas serão perdidas.`}
        >
            {restoreVersion.error && (
                <p role="alert" className="text-xs text-status-failed">
                    {restoreVersion.error.message}
                </p>
            )}
            <footer className="flex justify-end gap-2">
                <Button onClick={onClose}>Cancelar</Button>
                <Button
                    variant="danger"
                    loading={restoreVersion.isPending}
                    onClick={confirmRestore}
                >
                    Restaurar
                </Button>
            </footer>
        </Dialog>
    );
}
