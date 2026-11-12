import type { PublishedFlowInput } from "./forja_api.js";

import { adaptFlowToLocalItems } from "@/server/demo/local_items_flow.js";
import { basicFactoryTemplate } from "@/server/flows/templates/basic_factory.js";
import {
    buildMapGroup,
    createTemplateNode,
    placeInGroup,
} from "@/server/flows/templates/template_layout.js";
import { buildOutput, connect } from "@/server/flows/templates/template_nodes.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";

export const GATE_MESSAGE = "Confira o item antes de concluir.";

const FLOW_SCHEMA_VERSION = 1;

export function localBasicFactoryFlow(): PublishedFlowInput {
    return {
        name: basicFactoryTemplate.name,
        graph: adaptFlowToLocalItems(basicFactoryTemplate.build()),
    };
}

/** Each local item waits for a human approval and, approved, moves to done. */
export function localGateFlow(): PublishedFlowInput {
    const itemsGroup = buildMapGroup({
        id: "items",
        label: "Por item",
        columns: { first: 2, count: 2 },
        config: { concurrency: 1 },
    });

    const graph: FlowGraph = {
        schemaVersion: FLOW_SCHEMA_VERSION,
        nodes: [
            createTemplateNode("trigger", "trigger", { column: 0 }),
            buildLocalSource(),
            placeInGroup(buildGate(), itemsGroup),
            placeInGroup(
                buildOutput({ id: "done", cell: { column: 3 }, moveItemTo: "done" }),
                itemsGroup,
            ),
        ],
        edges: [
            connect(["trigger", "items"], ["source", "trigger"]),
            connect(["source", "items"], ["gate", "item"]),
            connect(["gate", "approved"], ["done", "item"]),
        ],
        groups: [itemsGroup],
    };

    return { name: "Aprovação humana", graph };
}

function buildLocalSource(): FlowNode {
    const source = createTemplateNode("source", "source", { column: 1 });
    return { ...source, config: { ...source.config, provider: "local" } };
}

function buildGate(): FlowNode {
    const gate = createTemplateNode("gate", "gate", { column: 2 });
    return { ...gate, config: { ...gate.config, message: GATE_MESSAGE } };
}
