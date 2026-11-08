import { Check } from "lucide-react";
import type { JSX } from "react";

import { projectDetectionSchema } from "@/shared/project_types.js";
import type { ProjectDetection } from "@/shared/project_types.js";

interface DetectionDescription {
    label: string;
    nextStepWhenMissing: string;
}

const DETECTIONS: Record<keyof ProjectDetection, DetectionDescription> = {
    codegraph: {
        label: "CodeGraph",
        nextStepWhenMissing:
            "Indexe o repositório com o CodeGraph para os agentes navegarem no código.",
    },
    codingStandards: {
        label: "CODING_STANDARDS.md",
        nextStepWhenMissing: "Adicione um CODING_STANDARDS.md para orientar o código dos agentes.",
    },
    sandcastle: {
        label: "Sandcastle",
        nextStepWhenMissing: "Sem Sandcastle: os fluxos da Forja cuidam da execução das issues.",
    },
};

export function DetectedList({ detection }: { detection: ProjectDetection }): JSX.Element {
    const detectedLabels = listDetections(detection, { isPresent: true }).map(
        (detected) => detected.label,
    );

    return (
        <ul aria-label="Detectado" className="flex flex-wrap gap-2">
            {detectedLabels.map((label) => (
                <li
                    key={label}
                    className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-xs"
                >
                    <Check aria-hidden className="size-3" />
                    {label}
                </li>
            ))}
            {detectedLabels.length === 0 && <li className="text-muted">Nada detectado</li>}
        </ul>
    );
}

export function NextStepHints({ detection }: { detection: ProjectDetection }): JSX.Element | null {
    const missing = listDetections(detection, { isPresent: false });
    if (missing.length === 0) {
        return null;
    }

    return (
        <ul className="flex flex-col gap-1 text-muted">
            {missing.map((description) => (
                <li key={description.label}>{description.nextStepWhenMissing}</li>
            ))}
        </ul>
    );
}

function listDetections(
    detection: ProjectDetection,
    { isPresent }: { isPresent: boolean },
): DetectionDescription[] {
    return projectDetectionSchema
        .keyof()
        .options.filter((entry) => detection[entry] === isPresent)
        .map((entry) => DETECTIONS[entry]);
}
