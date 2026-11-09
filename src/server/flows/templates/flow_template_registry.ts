import { NotFoundError } from "@/server/errors.js";
import { basicFactoryTemplate } from "@/server/flows/templates/basic_factory.js";
import { reviewLoopTemplate } from "@/server/flows/templates/review_loop.js";
import type { FlowGraph } from "@/shared/flow_graph.js";

export interface FlowTemplate {
    id: string;
    name: string;
    description: string;
    build(): FlowGraph;
}

export const FLOW_TEMPLATES: FlowTemplate[] = [basicFactoryTemplate, reviewLoopTemplate];

export function findFlowTemplateOrThrow(templateId: string): FlowTemplate {
    const template = FLOW_TEMPLATES.find((candidate) => candidate.id === templateId);
    if (!template) {
        throw new NotFoundError(`Template de fluxo ${templateId} não encontrado.`);
    }

    return template;
}
