import { useState } from "react";
import type { JSX } from "react";

import { SCRIPT_PRESETS } from "@/web/canvas/inspector/script_presets.js";
import type { ScriptPreset } from "@/web/canvas/inspector/script_presets.js";
import { Button } from "@/web/components/ui/button.js";
import { Tooltip } from "@/web/components/ui/tooltip.js";

export function ScriptPresetChips({
    currentCommand,
    onApply,
}: {
    currentCommand: string;
    onApply: (preset: ScriptPreset) => void;
}): JSX.Element {
    const [presetAwaitingConfirmation, setPresetAwaitingConfirmation] = useState<ScriptPreset>();

    function choosePreset(preset: ScriptPreset): void {
        if (wouldReplaceCommand(preset, currentCommand)) {
            setPresetAwaitingConfirmation(preset);
            return;
        }

        onApply(preset);
    }

    function confirmReplacement(preset: ScriptPreset): void {
        setPresetAwaitingConfirmation(undefined);
        onApply(preset);
    }

    return (
        <div className="flex flex-col gap-2">
            <div role="group" aria-label="Pontos de partida" className="flex flex-wrap gap-1">
                {SCRIPT_PRESETS.map((preset) => (
                    <Tooltip key={preset.id} content={preset.description}>
                        <Button size="sm" onClick={() => choosePreset(preset)}>
                            {preset.label}
                        </Button>
                    </Tooltip>
                ))}
            </div>
            {presetAwaitingConfirmation && (
                <ReplaceCommandConfirmation
                    onConfirm={() => confirmReplacement(presetAwaitingConfirmation)}
                    onCancel={() => setPresetAwaitingConfirmation(undefined)}
                />
            )}
        </div>
    );
}

function ReplaceCommandConfirmation({
    onConfirm,
    onCancel,
}: {
    onConfirm: () => void;
    onCancel: () => void;
}): JSX.Element {
    return (
        <div
            role="alert"
            className="flex items-center justify-between gap-2 rounded-sm border border-border bg-surface-raised p-2 text-sm"
        >
            <span>Substituir o comando atual?</span>
            <span className="flex gap-1">
                <Button size="sm" variant="primary" onClick={onConfirm}>
                    Substituir
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancel}>
                    Cancelar
                </Button>
            </span>
        </div>
    );
}

function wouldReplaceCommand(preset: ScriptPreset, currentCommand: string): boolean {
    const presetCommand = preset.config.command;
    if (presetCommand === undefined) {
        return false;
    }

    return currentCommand.trim() !== "" && currentCommand !== presetCommand;
}
