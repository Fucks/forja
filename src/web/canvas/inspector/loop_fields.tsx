import { useMemo } from "react";
import type { JSX } from "react";

import { nodesInsideGroup } from "@/engine/graph_queries.js";
import type { LoopGroup } from "@/engine/graph_queries.js";
import { loopConfigSchema, MAX_LOOP_ITERATIONS, MIN_LOOP_ITERATIONS } from "@/shared/flow_graph.js";
import type { FlowGraph, FlowNode, LoopConfig } from "@/shared/flow_graph.js";
import { ConditionEditor } from "@/web/canvas/inspector/condition_editor.js";
import { fieldDoc } from "@/web/canvas/inspector/field_doc.js";
import { FieldHeading } from "@/web/canvas/inspector/field_heading.js";
import { IntegerField } from "@/web/canvas/inspector/integer_field.js";
import { LoopExhaustedDiagram } from "@/web/canvas/inspector/loop_exhausted_diagram.js";
import { labelPort, useAvailableData } from "@/web/canvas/inspector/use_available_data.js";
import { Switch } from "@/web/components/ui/switch.js";

type LoopChange = (changes: Partial<LoopConfig>) => void;

interface CarryOption {
    port: string;
    label: string;
}

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
    const untilFields = useAvailableData(graph, loop.id, { scope: "loopUntil", groupId: loop.id });
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
                    fields={untilFields}
                    onChange={(until) => onChange({ until })}
                />
            </div>
            <CarryPortSwitches
                options={carryOptions}
                carry={config.carry}
                onChange={(carry) => onChange({ carry })}
            />
            <LoopExhaustedDiagram maxIterations={config.maxIterations} />
        </>
    );
}

function CarryPortSwitches({
    options,
    carry,
    onChange,
}: {
    options: CarryOption[];
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
            {options.map(({ port, label }) => (
                <Switch
                    key={port}
                    label={label}
                    checked={carry.includes(port)}
                    onChange={(shouldCarry) => toggleCarry(port, shouldCarry)}
                />
            ))}
        </div>
    );
}

// Ports already carried stay listed even if no node inside produces them anymore.
function listCarryOptions(graph: FlowGraph, loop: LoopGroup): CarryOption[] {
    const loopNodes = nodesInsideGroup(graph, loop.id);
    const outputNames = loopNodes.flatMap((node) => node.outputs.map((port) => port.name));
    const portNames = [...new Set([...outputNames, ...loop.config.carry])];

    return portNames.map((port) => ({
        port,
        label: describeCarriedPort(
            port,
            loopNodes.filter((node) => producesPort(node, port)),
        ),
    }));
}

function producesPort(node: FlowNode, portName: string): boolean {
    return node.outputs.some((port) => port.name === portName);
}

// Named like the Dados tab names the port, with the nodes of the loop that produce it.
function describeCarriedPort(portName: string, producers: FlowNode[]): string {
    const [firstProducer] = producers;
    const producedPort = firstProducer?.outputs.find((port) => port.name === portName);
    if (!firstProducer || !producedPort) {
        return `Levar ${portName}`;
    }

    const producerLabels = producers.map((node) => node.label).join(", ");
    return `Levar ${labelPort(firstProducer.type, producedPort)} (${producerLabels})`;
}
