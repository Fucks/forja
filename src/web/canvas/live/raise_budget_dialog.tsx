import { useState } from "react";
import type { FormEvent, JSX } from "react";

import type { RunActions } from "@/web/canvas/live/use_run_actions.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";

const MAX_COST_FIELD_ID = "run-budget-max-cost";
const CENTS_STEP_USD = "0.01";

export function RaiseBudgetDialog({
    raiseBudget,
    onClose,
}: {
    raiseBudget: RunActions["raiseBudget"];
    onClose: () => void;
}): JSX.Element {
    const [maxCostUsd, setMaxCostUsd] = useState("");

    const submitNewLimit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        raiseBudget.mutate({ run: { maxCostUsd: Number(maxCostUsd) } }, { onSuccess: onClose });
    };

    return (
        <Dialog
            open
            onOpenChange={onClose}
            title="Aumentar orçamento"
            description="A run retoma assim que o novo limite for salvo."
        >
            <form className="flex flex-col gap-4" onSubmit={submitNewLimit}>
                <Field
                    label="Novo limite da run (US$)"
                    htmlFor={MAX_COST_FIELD_ID}
                    error={raiseBudget.error?.message}
                >
                    <Input
                        required
                        type="number"
                        min={CENTS_STEP_USD}
                        step={CENTS_STEP_USD}
                        value={maxCostUsd}
                        onChange={(event) => setMaxCostUsd(event.target.value)}
                    />
                </Field>
                <footer className="flex justify-end gap-2">
                    <Button onClick={onClose}>Voltar</Button>
                    <Button type="submit" variant="primary" loading={raiseBudget.isPending}>
                        Salvar limite
                    </Button>
                </footer>
            </form>
        </Dialog>
    );
}
