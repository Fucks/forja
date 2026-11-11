import type { JSX } from "react";

import { assertNever } from "@/lib/assert_never.js";
import { MAX_MAP_CONCURRENCY, MIN_MAP_CONCURRENCY } from "@/shared/flow_graph.js";
import type { FlowGraph, FlowGroup, LoopConfig, MapConfig } from "@/shared/flow_graph.js";
import { GROUP_KIND_LABELS } from "@/web/canvas/grouping.js";
import { InspectorSection } from "@/web/canvas/inspector/inspector_section.js";
import { LabelField } from "@/web/canvas/inspector/label_field.js";
import { LoopFields } from "@/web/canvas/inspector/loop_fields.js";
import { Slider } from "@/web/components/ui/slider.js";
import { Switch } from "@/web/components/ui/switch.js";

export interface GroupInspectorProps {
    group: FlowGroup;
    graph: FlowGraph;
    onChange: (update: (group: FlowGroup) => FlowGroup) => void;
}

export function GroupInspector({ group, graph, onChange }: GroupInspectorProps): JSX.Element {
    return (
        <div className="flex flex-col">
            <LabelField
                label={group.label}
                onChange={(label) => onChange((current) => ({ ...current, label }))}
            />
            <InspectorSection title={GROUP_KIND_LABELS[group.kind]} isInitiallyOpen>
                <GroupConfigFields group={group} graph={graph} onChange={onChange} />
            </InspectorSection>
        </div>
    );
}

function GroupConfigFields({ group, graph, onChange }: GroupInspectorProps): JSX.Element {
    switch (group.kind) {
        case "map":
            return (
                <MapFields
                    config={group.config}
                    onChange={(changes) => onChange((current) => withMapConfig(current, changes))}
                />
            );
        case "loop":
            return (
                <LoopFields
                    loop={group}
                    graph={graph}
                    onChange={(changes) => onChange((current) => withLoopConfig(current, changes))}
                />
            );
        default:
            return assertNever(group);
    }
}

function MapFields({
    config,
    onChange,
}: {
    config: MapConfig;
    onChange: (changes: Partial<MapConfig>) => void;
}): JSX.Element {
    return (
        <>
            <div className="flex flex-col gap-1">
                <Slider
                    label="Concorrência"
                    value={config.concurrency}
                    min={MIN_MAP_CONCURRENCY}
                    max={MAX_MAP_CONCURRENCY}
                    onChange={(concurrency) => onChange({ concurrency })}
                />
                <p className="text-xs text-muted">{describeConcurrency(config.concurrency)}</p>
            </div>
            <Switch
                label="Esperar todos (barreira)"
                checked={config.barrier}
                onChange={(barrier) => onChange({ barrier })}
            />
            <Switch
                label="Parar todos na primeira falha"
                checked={config.failFast}
                onChange={(failFast) => onChange({ failFast })}
            />
        </>
    );
}

function describeConcurrency(concurrency: number): string {
    const unit = concurrency === 1 ? "item" : "itens";

    return `até ${concurrency} ${unit} ao mesmo tempo`;
}

function withMapConfig(group: FlowGroup, changes: Partial<MapConfig>): FlowGroup {
    if (group.kind !== "map") {
        return group;
    }

    return { ...group, config: { ...group.config, ...changes } };
}

function withLoopConfig(group: FlowGroup, changes: Partial<LoopConfig>): FlowGroup {
    if (group.kind !== "loop") {
        return group;
    }

    return { ...group, config: { ...group.config, ...changes } };
}
