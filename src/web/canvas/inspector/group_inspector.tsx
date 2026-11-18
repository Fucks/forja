import type { JSX } from "react";

import { assertNever } from "@/lib/assert_never.js";
import { MAX_MAP_CONCURRENCY, MIN_MAP_CONCURRENCY } from "@/shared/flow_graph.js";
import type { FlowGraph, FlowGroup, LoopConfig, MapConfig } from "@/shared/flow_graph.js";
import { fieldDoc } from "@/web/canvas/inspector/field_doc.js";
import { FieldHelp } from "@/web/canvas/inspector/field_help.js";
import { FieldHint } from "@/web/canvas/inspector/field_hint.js";
import { InspectorFields } from "@/web/canvas/inspector/inspector_section.js";
import { GroupDataTab } from "@/web/canvas/inspector/node_data_tab.js";
import { LoopFields } from "@/web/canvas/inspector/loop_fields.js";
import { InspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { SwitchField } from "@/web/canvas/inspector/switch_field.js";
import { Slider } from "@/web/components/ui/slider.js";

export interface GroupInspectorProps {
    group: FlowGroup;
    graph: FlowGraph;
    onChange: (update: (group: FlowGroup) => FlowGroup) => void;
}

export function GroupInspector({ group, graph, onChange }: GroupInspectorProps): JSX.Element {
    return (
        <InspectorFrame
            type={group.kind}
            label={group.label}
            onLabelChange={(label) => onChange((current) => ({ ...current, label }))}
            data={<GroupDataTab kind={group.kind} />}
        >
            <InspectorFields>
                <GroupConfigFields group={group} graph={graph} onChange={onChange} />
            </InspectorFields>
        </InspectorFrame>
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

const BARRIER_DOC = fieldDoc("map", "barrier");
const FAIL_FAST_DOC = fieldDoc("map", "failFast");
const CONCURRENCY_EXAMPLE =
    "Quantos itens ao mesmo tempo. Ex.: com 3, três Devs implementam três issues em paralelo; " +
    "com 1, um item por vez.";

function MapFields({
    config,
    onChange,
}: {
    config: MapConfig;
    onChange: (changes: Partial<MapConfig>) => void;
}): JSX.Element {
    const concurrencyDoc = fieldDoc("map", "concurrency");

    return (
        <>
            <div className="flex flex-col gap-1">
                <Slider
                    label={concurrencyDoc.label}
                    labelAddon={<FieldHelp doc={concurrencyDoc} />}
                    value={config.concurrency}
                    min={MIN_MAP_CONCURRENCY}
                    max={MAX_MAP_CONCURRENCY}
                    onChange={(concurrency) => onChange({ concurrency })}
                />
                <p className="text-xs text-muted">{describeConcurrency(config.concurrency)}</p>
                <FieldHint>{CONCURRENCY_EXAMPLE}</FieldHint>
            </div>
            <SwitchField
                doc={BARRIER_DOC}
                checked={config.barrier}
                hint={BARRIER_DOC.description}
                onChange={(barrier) => onChange({ barrier })}
            />
            <SwitchField
                doc={FAIL_FAST_DOC}
                checked={config.failFast}
                hint={FAIL_FAST_DOC.description}
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
