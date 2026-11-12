import type { Clock } from "@/lib/clock.js";
import type { ForjaDb } from "@/server/db/client.js";
import { adaptFlowToLocalItems } from "@/server/demo/local_items_flow.js";
import { createAppFlowService } from "@/server/flows/app_flow_service.js";
import { basicFactoryTemplate } from "@/server/flows/templates/basic_factory.js";
import type { EventBus } from "@/server/runtime/event_bus.js";

export interface DemoFlowDeps {
    db: ForjaDb;
    events: EventBus;
    clock: Clock;
}

/** Publishes the basic factory, adapted to local items, as the default flow of the project. */
export async function publishDemoFlow(deps: DemoFlowDeps, projectId: string): Promise<string> {
    const flows = createAppFlowService(deps);
    const flow = await flows.create(projectId, {
        name: basicFactoryTemplate.name,
        graph: adaptFlowToLocalItems(basicFactoryTemplate.build()),
    });
    await flows.publish(flow.id);
    await flows.setDefault(flow.id);

    return flow.id;
}
