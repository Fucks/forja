import { useState } from "react";
import type { JSX } from "react";

import type {
    ConditionConfig,
    SwitchConditionConfig,
} from "@/shared/node_configs/condition_config.js";
import { toIfConfig, toSwitchConfig } from "@/web/canvas/inspector/condition_branch_edits.js";
import { Button } from "@/web/components/ui/button.js";
import { SegmentedControl } from "@/web/components/ui/segmented_control.js";

type DecisionMode = ConditionConfig["mode"];

const MODE_OPTIONS: { value: DecisionMode; label: string }[] = [
    { value: "if", label: "Sim/Não" },
    { value: "switch", label: "Vários caminhos" },
];

// Going back to yes/no keeps only the first branch, so dropping the others is confirmed first.
export function DecisionModeSwitch({
    config,
    onChange,
}: {
    config: ConditionConfig;
    onChange: (config: ConditionConfig) => void;
}): JSX.Element {
    const [isConfirmingBranchRemoval, setIsConfirmingBranchRemoval] = useState(false);

    function chooseMode(mode: DecisionMode): void {
        if (mode === config.mode) {
            return;
        }
        if (config.mode === "if") {
            onChange(toSwitchConfig(config));
            return;
        }
        if (config.branches.length > 1) {
            setIsConfirmingBranchRemoval(true);
            return;
        }

        onChange(toIfConfig(config));
    }

    return (
        <div className="flex flex-col gap-2">
            <SegmentedControl
                label="Tipo de decisão"
                value={config.mode}
                options={MODE_OPTIONS}
                onChange={chooseMode}
            />
            {isConfirmingBranchRemoval && config.mode === "switch" && (
                <BranchRemovalConfirmation
                    config={config}
                    onConfirm={() => {
                        setIsConfirmingBranchRemoval(false);
                        onChange(toIfConfig(config));
                    }}
                    onCancel={() => setIsConfirmingBranchRemoval(false)}
                />
            )}
        </div>
    );
}

function BranchRemovalConfirmation({
    config,
    onConfirm,
    onCancel,
}: {
    config: SwitchConditionConfig;
    onConfirm: () => void;
    onCancel: () => void;
}): JSX.Element {
    const removedBranchCount = config.branches.length - 1;

    return (
        <div
            role="alert"
            className="flex items-center justify-between gap-2 rounded-sm border border-border bg-surface-raised p-2 text-sm"
        >
            <span>
                Sim/Não fica só com o primeiro caminho. Remover os outros {removedBranchCount}?
            </span>
            <span className="flex gap-1">
                <Button size="sm" variant="primary" onClick={onConfirm}>
                    Remover e trocar
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancel}>
                    Cancelar
                </Button>
            </span>
        </div>
    );
}
