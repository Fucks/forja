import { createAppFlowService } from "@/server/flows/app_flow_service.js";
import type { ForjaDb } from "@/server/db/client.js";
import { basicFactoryTemplate } from "@/server/flows/templates/basic_factory.js";
import type { Clock } from "@/lib/clock.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import type { FlowGraph, FlowNode } from "@/shared/flow_graph.js";

export interface DemoFlowDeps {
    db: ForjaDb;
    events: EventBus;
    clock: Clock;
}

const ISSUE_NUMBER_VARIABLE = "{{item.number}}";
const ITEM_ID_VARIABLE = "{{item.id}}";

/** Publishes the basic factory, adapted to local items, as the default flow of the project. */
export async function publishDemoFlow(deps: DemoFlowDeps, projectId: string): Promise<string> {
    const flows = createAppFlowService(deps);
    const flow = await flows.create(projectId, {
        name: basicFactoryTemplate.name,
        graph: adaptToLocalItems(basicFactoryTemplate.build()),
    });
    await flows.publish(flow.id);
    await flows.setDefault(flow.id);

    return flow.id;
}

// The basic factory works on GitHub issues; the demo has only local items, which have no number.
function adaptToLocalItems(graph: FlowGraph): FlowGraph {
    return { ...graph, nodes: graph.nodes.map(adaptNodeToLocalItems) };
}

function adaptNodeToLocalItems(node: FlowNode): FlowNode {
    switch (node.type) {
        case "source":
            return { ...node, config: { ...node.config, provider: "local", label: undefined } };
        case "agent":
            return {
                ...node,
                config: { ...node.config, prompt: nameItemById(node.config.prompt) },
            };
        default:
            return node;
    }
}

function nameItemById(prompt: string): string {
    return prompt.replaceAll(ISSUE_NUMBER_VARIABLE, ITEM_ID_VARIABLE);
}
