import type { JSX } from "react";

import type { GateConfig } from "@/shared/node_configs/gate_config.js";
import type { OptionCard } from "@/web/canvas/inspector/option_cards.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";

export type GateReviewSection = GateConfig["show"][number];

const PREVIEW_TITLE = "Prévia da tela Aprovações";
const MESSAGE_PLACEHOLDER = "Sem mensagem: escreva o que a pessoa deve conferir.";

/** A sketch of how the approval will look on the Aprovações screen. */
export function GatePreview({
    config,
    sectionOptions,
}: {
    config: GateConfig;
    sectionOptions: OptionCard<GateReviewSection>[];
}): JSX.Element {
    const shownSections = sectionOptions.filter((option) => config.show.includes(option.value));

    return (
        <figure
            aria-label={PREVIEW_TITLE}
            className="flex flex-col gap-3 rounded-sm border border-dashed border-border p-3"
        >
            <figcaption className="text-xs text-muted">{PREVIEW_TITLE}</figcaption>
            <p className="text-sm font-semibold whitespace-pre-wrap">
                {config.message.trim() === "" ? MESSAGE_PLACEHOLDER : config.message}
            </p>
            <div className="flex gap-2">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-20" />
            </div>
            {shownSections.map((option) => (
                <PreviewSection key={option.value} section={option.value} label={option.label} />
            ))}
        </figure>
    );
}

// The logs are a link to the run on the real screen, not a section of their own.
function PreviewSection({
    section,
    label,
}: {
    section: GateReviewSection;
    label: string;
}): JSX.Element {
    if (section === "logs") {
        return <p className="text-xs text-accent underline">Ver logs da run</p>;
    }

    return (
        <section aria-label={label} className="flex flex-col gap-1">
            <h4 className="text-xs font-medium">{label}</h4>
            <Skeleton className="h-10" />
        </section>
    );
}
