import { useState } from "react";
import type { FormEvent, JSX } from "react";

import type { FlowSummary } from "@/shared/flow_types.js";
import { useRenameFlow } from "@/web/app/flows/use_flows.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";

/** Closed while there is no flow to rename. */
export function RenameFlowDialog({
    flow,
    onClose,
}: {
    flow: FlowSummary | undefined;
    onClose: () => void;
}): JSX.Element {
    const closeWhenDismissed = (open: boolean): void => {
        if (!open) {
            onClose();
        }
    };

    return (
        <Dialog open={flow !== undefined} onOpenChange={closeWhenDismissed} title="Renomear fluxo">
            {flow && <RenameFlowForm key={flow.id} flow={flow} onDone={onClose} />}
        </Dialog>
    );
}

function RenameFlowForm({ flow, onDone }: { flow: FlowSummary; onDone: () => void }): JSX.Element {
    const [name, setName] = useState(flow.name);
    const renameFlow = useRenameFlow();

    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        renameFlow.mutate({ flowId: flow.id, name }, { onSuccess: onDone });
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label="Nome" htmlFor="rename-flow-name" error={renameFlow.error?.message}>
                <Input required value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <footer className="flex justify-end gap-2">
                <Button onClick={onDone}>Cancelar</Button>
                <Button type="submit" variant="primary" loading={renameFlow.isPending}>
                    Renomear
                </Button>
            </footer>
        </form>
    );
}
