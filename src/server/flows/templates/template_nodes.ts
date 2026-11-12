import { appendPromptSection, loadPrompt } from "@/server/flows/templates/load_prompt.js";
import type { PromptSection, TemplatePromptName } from "@/server/flows/templates/load_prompt.js";
import { createTemplateNode } from "@/server/flows/templates/template_layout.js";
import type { CanvasCell } from "@/server/flows/templates/template_layout.js";
import {
    CODEGRAPH_PRESET_ID,
    READONLY_PRESET_ID,
} from "@/server/tool_profiles/tool_profile_presets.js";
import type { FlowEdge, FlowNode, NodeOfType, Port } from "@/shared/flow_graph.js";
import type { OutputConfig } from "@/shared/node_configs/output_config.js";

export interface AgentNodeSpec {
    id: string;
    label: string;
    cell: CanvasCell;
    extraInput?: Port;
    promptSection?: PromptSection;
}

const SANDCASTLE_LABEL = "Sandcastle";
const COMPLETION_SIGNAL = "<promise>COMPLETE</promise>";
const DEVELOPER_MAX_ITERATIONS = 50;
const SUMMARY_PORT = "summary";
const OPEN_PULL_REQUEST_NODE_ID = "open_pr";
const DONE_OUTPUT_NODE_ID = "output";

// Edges are the only ordering between nodes: this input makes the item wait for its pull request,
// so an item that was never approved is not moved to done.
const PULL_REQUEST_INPUT: Port = { name: "pullRequest", type: "json", required: false };

const TECH_LEAD_OUTPUT_SCHEMA = {
    type: "object",
    properties: { ready: { type: "boolean" } },
    required: ["ready"],
};

const REVIEWER_OUTPUT_SCHEMA = {
    type: "object",
    properties: { approved: { type: "boolean" }, notes: { type: "string" } },
    required: ["approved", "notes"],
};

export function connect(
    [fromNodeId, fromPort]: [string, string],
    [toNodeId, toPort]: [string, string],
): FlowEdge {
    return {
        id: `${fromNodeId}.${fromPort}->${toNodeId}.${toPort}`,
        from: { nodeId: fromNodeId, port: fromPort },
        to: { nodeId: toNodeId, port: toPort },
    };
}

export function buildManualTrigger(): FlowNode {
    return createTemplateNode("trigger", "trigger", { column: 0 });
}

export function buildSandcastleIssuesSource(): NodeOfType<"source"> {
    const source = createTemplateNode("source", "source", { column: 1 });

    return {
        ...source,
        config: {
            ...source.config,
            provider: "github",
            label: SANDCASTLE_LABEL,
            skipBlocked: true,
        },
    };
}

export function buildTechLeadAgent(spec: AgentNodeSpec): FlowNode {
    const techLead = createAgentNode(spec);

    return {
        ...techLead,
        config: {
            ...techLead.config,
            prompt: buildPrompt("tl_spec", spec.promptSection),
            workspace: "none",
            effort: "high",
            toolProfileId: READONLY_PRESET_ID,
            outputSchema: TECH_LEAD_OUTPUT_SCHEMA,
        },
    };
}

export function buildDeveloperAgent(spec: AgentNodeSpec): FlowNode {
    const developer = createAgentNode(spec);

    return {
        ...developer,
        config: {
            ...developer.config,
            prompt: buildPrompt("developer", spec.promptSection),
            workspace: "item",
            maxIterations: DEVELOPER_MAX_ITERATIONS,
            completionSignal: COMPLETION_SIGNAL,
            toolProfileId: CODEGRAPH_PRESET_ID,
        },
    };
}

export function buildReviewerAgent(spec: AgentNodeSpec): FlowNode {
    const reviewer = createAgentNode(spec);

    return {
        ...reviewer,
        config: {
            ...reviewer.config,
            prompt: buildPrompt("reviewer", spec.promptSection),
            workspace: "item",
            effort: "high",
            outputSchema: REVIEWER_OUTPUT_SCHEMA,
        },
    };
}

export function buildOpenPullRequest(cell: CanvasCell): NodeOfType<"git"> {
    const openPullRequest = createTemplateNode("git", OPEN_PULL_REQUEST_NODE_ID, cell);

    return {
        ...openPullRequest,
        label: "Abrir PR",
        config: { ...openPullRequest.config, action: "open_pr", bodyFrom: SUMMARY_PORT },
    };
}

export function buildDoneOutput(cell: CanvasCell): FlowNode {
    const output = buildOutput({ id: DONE_OUTPUT_NODE_ID, cell, moveItemTo: "done" });

    return { ...output, inputs: [...output.inputs, PULL_REQUEST_INPUT] };
}

export function connectPullRequestToDoneOutput(): FlowEdge {
    return connect(
        [OPEN_PULL_REQUEST_NODE_ID, "result"],
        [DONE_OUTPUT_NODE_ID, PULL_REQUEST_INPUT.name],
    );
}

export function buildOutput(spec: {
    id: string;
    label?: string;
    cell: CanvasCell;
    moveItemTo: NonNullable<OutputConfig["moveItemTo"]>;
}): NodeOfType<"output"> {
    const output = createTemplateNode("output", spec.id, spec.cell);

    return {
        ...output,
        label: spec.label ?? output.label,
        config: { ...output.config, moveItemTo: spec.moveItemTo },
    };
}

function createAgentNode(spec: AgentNodeSpec): NodeOfType<"agent"> {
    const agent = createTemplateNode("agent", spec.id, spec.cell);
    const inputs = spec.extraInput ? [...agent.inputs, spec.extraInput] : agent.inputs;

    return { ...agent, label: spec.label, inputs };
}

function buildPrompt(name: TemplatePromptName, section: PromptSection | undefined): string {
    const prompt = loadPrompt(name);
    if (!section) {
        return prompt;
    }

    return appendPromptSection(prompt, section);
}
