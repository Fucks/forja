import { useState } from "react";
import type { JSX } from "react";

import { SampleRow, StyleguideSection } from "@/web/app/styleguide/styleguide_section.js";
import { SegmentedControl } from "@/web/components/ui/segmented_control.js";
import { Slider } from "@/web/components/ui/slider.js";
import { Switch } from "@/web/components/ui/switch.js";

type LogView = "timeline" | "raw";

const LOG_VIEW_OPTIONS: { value: LogView; label: string }[] = [
    { value: "timeline", label: "Linha do tempo" },
    { value: "raw", label: "Bruto" },
];

const PARALLEL_AGENTS = { initial: 2, min: 1, max: 8 };

export function SwitchSamples(): JSX.Element {
    const [isTriggerEnabled, setIsTriggerEnabled] = useState(true);
    const [isAutoMergeEnabled, setIsAutoMergeEnabled] = useState(false);

    return (
        <StyleguideSection title="Switch">
            <SampleRow label="Ligado e desligado">
                <Switch
                    checked={isTriggerEnabled}
                    onChange={setIsTriggerEnabled}
                    label="Gatilho ativo"
                />
                <Switch
                    checked={isAutoMergeEnabled}
                    onChange={setIsAutoMergeEnabled}
                    label="Merge automático"
                />
            </SampleRow>
        </StyleguideSection>
    );
}

export function SliderSamples(): JSX.Element {
    const [parallelAgents, setParallelAgents] = useState(PARALLEL_AGENTS.initial);

    return (
        <StyleguideSection title="Slider">
            <div className="max-w-sm">
                <Slider
                    label="Agentes em paralelo"
                    value={parallelAgents}
                    min={PARALLEL_AGENTS.min}
                    max={PARALLEL_AGENTS.max}
                    onChange={setParallelAgents}
                />
            </div>
        </StyleguideSection>
    );
}

export function SegmentedControlSamples(): JSX.Element {
    const [logView, setLogView] = useState<LogView>("timeline");

    return (
        <StyleguideSection title="SegmentedControl">
            <SegmentedControl
                label="Visualização do log"
                value={logView}
                onChange={setLogView}
                options={LOG_VIEW_OPTIONS}
            />
        </StyleguideSection>
    );
}
