import { Upload } from "lucide-react";
import { useRef } from "react";
import type { ChangeEvent, JSX } from "react";

import type { FlowSummary } from "@/shared/flow_types.js";
import { useImportFlow } from "@/web/app/flows/use_flows.js";
import { Button } from "@/web/components/ui/button.js";

const ACCEPTED_FILE_TYPES = ".yaml,.yml";

/** A broken file shows the server's message, which names the line and column of the problem. */
export function ImportFlowButton({
    projectId,
    onImported,
}: {
    projectId: string;
    onImported: (flow: FlowSummary) => void;
}): JSX.Element {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importFlow = useImportFlow(projectId);

    const importChosenFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
        const input = event.currentTarget;
        const [file] = input.files ?? [];
        if (!file) {
            return;
        }

        const yaml = await file.text();
        // Choosing the same file again after fixing it must fire another change.
        input.value = "";
        importFlow.mutate(yaml, { onSuccess: onImported });
    };

    return (
        <div className="flex flex-col items-end gap-1">
            <Button loading={importFlow.isPending} onClick={() => fileInputRef.current?.click()}>
                <Upload aria-hidden className="size-4" />
                Importar
            </Button>
            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                aria-label="Arquivo do fluxo"
                className="hidden"
                onChange={(event) => void importChosenFile(event)}
            />
            {importFlow.error && (
                <p role="alert" className="text-xs text-status-failed">
                    {importFlow.error.message}
                </p>
            )}
        </div>
    );
}
