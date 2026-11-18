import * as RadixDialog from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { useState } from "react";
import type { JSX } from "react";

import {
    isEditorTourDismissed,
    rememberEditorTourDismissed,
} from "@/web/canvas/editor_tour_storage.js";
import { TOUR_STEPS } from "@/web/canvas/editor_tour_steps.js";
import type { TourStep } from "@/web/canvas/editor_tour_steps.js";
import { TOUR_POPOVER_WIDTH_PX, useTourPlacement } from "@/web/canvas/use_tour_placement.js";
import { Button } from "@/web/components/ui/button.js";
import { OVERLAY_SURFACE_CLASSES } from "@/web/components/ui/overlay_parts.js";

const FIRST_STEP_INDEX = 0;

/**
 * Introduces the editor on its first opening. Skipping (Pular, Esc) closes it until the next
 * opening; finishing it or choosing "Não mostrar de novo" closes it for good.
 */
export function EditorTour(): JSX.Element | null {
    const [isOpen, setIsOpen] = useState(() => !isEditorTourDismissed());
    const [stepIndex, setStepIndex] = useState(FIRST_STEP_INDEX);

    if (!isOpen) {
        return null;
    }

    function skipTour(): void {
        setIsOpen(false);
    }

    function dismissTour(): void {
        rememberEditorTourDismissed();
        setIsOpen(false);
    }

    return (
        <RadixDialog.Root open onOpenChange={skipTour}>
            <RadixDialog.Portal>
                <TourStepPopover
                    stepIndex={stepIndex}
                    onBack={() => setStepIndex(stepIndex - 1)}
                    onNext={() => setStepIndex(stepIndex + 1)}
                    onSkip={skipTour}
                    onDismiss={dismissTour}
                />
            </RadixDialog.Portal>
        </RadixDialog.Root>
    );
}

function TourStepPopover({
    stepIndex,
    onBack,
    onNext,
    onSkip,
    onDismiss,
}: {
    stepIndex: number;
    onBack: () => void;
    onNext: () => void;
    onSkip: () => void;
    onDismiss: () => void;
}): JSX.Element {
    const step = findStep(stepIndex);
    const placement = useTourPlacement(step.anchorSelector);
    const isFirstStep = stepIndex === FIRST_STEP_INDEX;
    const isLastStep = stepIndex === TOUR_STEPS.length - 1;

    // Without its anchor on screen the step stays in the middle of the editor.
    return (
        <RadixDialog.Content
            style={{ width: TOUR_POPOVER_WIDTH_PX, ...placement }}
            className={clsx(
                OVERLAY_SURFACE_CLASSES,
                "rounded-lg p-4",
                !placement && "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            )}
        >
            <TourStepText step={step} stepIndex={stepIndex} />
            <footer className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={onSkip}>
                        Pular
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onDismiss}>
                        Não mostrar de novo
                    </Button>
                </div>
                <div className="flex gap-1">
                    {!isFirstStep && (
                        <Button size="sm" onClick={onBack}>
                            Voltar
                        </Button>
                    )}
                    <Button variant="primary" size="sm" onClick={isLastStep ? onDismiss : onNext}>
                        {isLastStep ? "Concluir" : "Próximo"}
                    </Button>
                </div>
            </footer>
        </RadixDialog.Content>
    );
}

function TourStepText({ step, stepIndex }: { step: TourStep; stepIndex: number }): JSX.Element {
    return (
        <div className="flex flex-col gap-1">
            <p className="text-xs text-muted">
                {stepIndex + 1} de {TOUR_STEPS.length}
            </p>
            <RadixDialog.Title className="font-condensed text-lg font-semibold">
                {step.title}
            </RadixDialog.Title>
            <RadixDialog.Description className="text-sm">{step.text}</RadixDialog.Description>
        </div>
    );
}

function findStep(stepIndex: number): TourStep {
    const step = TOUR_STEPS[stepIndex];
    if (!step) {
        throw new Error(`The editor tour has no step ${stepIndex}`);
    }

    return step;
}
