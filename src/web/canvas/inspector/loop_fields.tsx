import { useMemo } from "react";
import type { JSX } from "react";

import { nodesInsideGroup } from "@/engine/graph_queries.js";
import type { LoopGroup } from "@/engine/graph_queries.js";
import { loopConfigSchema, MAX_LOOP_ITERATIONS, MIN_LOOP_ITERATIONS } from "@/shared/flow_graph.js";
import type { FlowGraph, LoopConfig } from "@/shared/flow_graph.js";
import { ConditionEditor } from "@/web/canvas/inspector/condition_editor.js";
import { listGroupOutputPaths } from "@/web/canvas/inspector/condition_suggestions.js";
import { fieldDoc } from "@/web/canvas/inspector/field_doc.js";
import { FieldHeading } from "@/web/canvas/inspector/field_heading.js";
import { IntegerField } from "@/web/canvas/inspector/integer_field.js";
import { Switch } from "@/web/components/ui/switch.js";

type LoopChange = (changes: Partial<LoopConfig>) => void;

const LOOP_FIELDS = loopConfigSchema.shape;
const ITERATION_LIMITS = { min: MIN_LOOP_ITERATIONS, max: MAX_LOOP_ITERATIONS };

export function LoopFields({
    loop,
    graph,
    onChange,
}: {
    loop: LoopGroup;
    graph: FlowGraph;
    onChange: LoopChange;
}): JSX.Element {
    const { config } = loop;
    const suggestions = useMemo(() => listGroupOutputPaths(graph, loop.id), [graph, loop.id]);
    const carryOptions = useMemo(() => listCarryOptions(graph, loop), [graph, loop]);

    return (
        <>
            <IntegerField
                doc={fieldDoc("loop", "maxIterations")}
                value={config.maxIterations}
                schema={LOOP_FIELDS.maxIterations}
                limits={ITERATION_LIMITS}
                onChange={(maxIterations) => onChange({ maxIterations })}
            />
            <div className="flex flex-col gap-2">
                <FieldHeading doc={fieldDoc("loop", "until")} />
                <ConditionEditor
                    value={config.until}
                    suggestions={suggestions}
                    onChange={(until) => onChange({ until })}
                />
            </div>
            <CarryPortSwitches
                options={carryOptions}
                carry={config.carry}
                onChange={(carry) => onChange({ carry })}
            />
        </>
    );
}

function CarryPortSwitches({
    options,
    carry,
    onChange,
}: {
    options: string[];
    carry: string[];
    onChange: (carry: string[]) => void;
}): JSX.Element {
    function toggleCarry(port: string, shouldCarry: boolean): void {
        const otherPorts = carry.filter((carried) => carried !== port);
        onChange(shouldCarry ? [...otherPorts, port] : otherPorts);
    }

    return (
        <div className="flex flex-col gap-2">
            <FieldHeading doc={fieldDoc("loop", "carry")} />
            {options.length === 0 && (
                <p className="text-xs text-muted">Nenhuma porta de saída dentro do loop.</p>
            )}
            {options.map((port) => (
                <Switch
                    key={port}
                    label={`Levar ${port}`}
                    checked={carry.includes(port)}
                    onChange={(shouldCarry) => toggleCarry(port, shouldCarry)}
                />
            ))}
        </div>
    );
}

// Ports already carried stay listed even if no node inside produces them anymore.
function listCarryOptions(graph: FlowGraph, loop: LoopGroup): string[] {
    const outputNames = nodesInsideGroup(graph, loop.id).flatMap((node) =>
        node.outputs.map((port) => port.name),
    );

    return [...new Set([...outputNames, ...loop.config.carry])];
}
