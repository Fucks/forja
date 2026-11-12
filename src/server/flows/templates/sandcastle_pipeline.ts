import type { FlowTemplate } from "@/server/flows/templates/flow_template_registry.js";
import { loadPrompt } from "@/server/flows/templates/load_prompt.js";
import type { TemplatePromptName } from "@/server/flows/templates/load_prompt.js";
import {
    buildMapGroup,
    createTemplateNode,
    placeInGroup,
} from "@/server/flows/templates/template_layout.js";
import type { CanvasCell } from "@/server/flows/templates/template_layout.js";
import {
    buildDoneOutput,
    buildManualTrigger,
    buildOpenPullRequest,
    buildOutput,
    buildSandcastleIssuesSource,
    COMPLETION_SIGNAL,
    connect,
    connectPullRequestToDoneOutput,
    createAgentNode,
} from "@/server/flows/templates/template_nodes.js";
import { CODEGRAPH_PRESET_ID } from "@/server/tool_profiles/tool_profile_presets.js";
import type { FlowGraph, FlowNode, NodeOfType, Port } from "@/shared/flow_graph.js";
import type { AgentConfig } from "@/shared/node_configs/agent_config.js";

const SOURCE_LIMIT = 10;
// One item at a time, like `.sandcastle/main.mts`; the user can raise it on the canvas.
const ITEMS_IN_PARALLEL = 1;
const IMPLEMENTER_MAX_ITERATIONS = 100;
const IMPLEMENTER_IDLE_TIMEOUT_MINUTES = 15;
const EVIDENCE_BODY_PATH = "evidence.body";

// Edges are the only ordering between nodes: each of these inputs makes a step wait for the one
// before it and, after a condition, for the branch the condition chose.
const IMPLEMENTATION_INPUT = optionalJsonInput("implementation");
const REVIEW_INPUT: Port = { name: "review", type: "text", required: false };
const REBASE_INPUT = optionalJsonInput("rebase");
const EVIDENCE_INPUT = optionalJsonInput("evidence");

const EVIDENCE_OUTPUT_SCHEMA = {
    type: "object",
    properties: {
        checksPassed: { type: "boolean" },
        failureSummary: { type: "string" },
        body: { type: "string" },
    },
    required: ["checksPassed", "body"],
};

interface AgentStep {
    id: string;
    label: string;
    cell: CanvasCell;
    prompt: TemplatePromptName;
    config?: Partial<AgentConfig>;
    extraInput?: Port;
}

export const sandcastlePipelineTemplate: FlowTemplate = {
    id: "sandcastle_pipeline",
    name: "Pipeline Sandcastle",
    description:
        "O pipeline do `.sandcastle/main.mts` no canvas: para cada issue desbloqueada, implementa, " +
        "revisa, faz rebase, junta as evidências e abre o PR quando os checks passam; " +
        "sem commits ou com checks falhando, vai para “precisa de humano”.",
    build: buildSandcastlePipeline,
};

function buildSandcastlePipeline(): FlowGraph {
    const itemsGroup = buildMapGroup({
        id: "implement_and_review",
        label: "Implementar e revisar",
        columns: { first: 2, count: 8 },
        config: { concurrency: ITEMS_IN_PARALLEL },
    });
    const stepsOfEachItem = [
        buildImplementer(),
        buildHasCommitsCondition(),
        buildNeedsHumanWithoutCommits(),
        buildReviewer(),
        buildRebase(),
        buildEvidence(),
        buildChecksPassedCondition(),
        buildOpenPullRequestWithEvidence(),
        buildDoneOutput({ column: 9 }),
        buildNeedsHumanAfterFailedChecks(),
    ];

    return {
        schemaVersion: 1,
        nodes: [
            buildManualTrigger(),
            buildLimitedSandcastleIssuesSource(),
            ...stepsOfEachItem.map((node) => placeInGroup(node, itemsGroup)),
        ],
        edges: [
            connect(["trigger", "items"], ["source", "trigger"]),
            connect(["source", "items"], ["implementer", "item"]),
            connect(["implementer", "result"], ["has_commits", "value"]),
            connect(["has_commits", "true"], ["reviewer", IMPLEMENTATION_INPUT.name]),
            connect(
                ["has_commits", "false"],
                ["needs_human_without_commits", IMPLEMENTATION_INPUT.name],
            ),
            connect(["reviewer", "summary"], ["rebase", REVIEW_INPUT.name]),
            connect(["rebase", "result"], ["evidence", REBASE_INPUT.name]),
            connect(["evidence", "result"], ["checks_passed", "value"]),
            connect(["checks_passed", "true"], ["open_pr", EVIDENCE_INPUT.name]),
            connect(["checks_passed", "false"], ["needs_human_failed_checks", EVIDENCE_INPUT.name]),
            connectPullRequestToDoneOutput(),
        ],
        groups: [itemsGroup],
    };
}

function buildLimitedSandcastleIssuesSource(): FlowNode {
    const source = buildSandcastleIssuesSource();

    return { ...source, config: { ...source.config, limit: SOURCE_LIMIT } };
}

function buildImplementer(): FlowNode {
    return buildAgentStep({
        id: "implementer",
        label: "Implementer",
        cell: { column: 2 },
        prompt: "sandcastle_implement",
        config: {
            maxIterations: IMPLEMENTER_MAX_ITERATIONS,
            idleTimeoutMinutes: IMPLEMENTER_IDLE_TIMEOUT_MINUTES,
            completionSignal: COMPLETION_SIGNAL,
            toolProfileId: CODEGRAPH_PRESET_ID,
        },
    });
}

function buildHasCommitsCondition(): FlowNode {
    const condition = createTemplateNode("condition", "has_commits", { column: 3 });

    return {
        ...condition,
        label: "Fez commits?",
        config: { condition: { op: "gt", path: "commits", value: 0 } },
    };
}

function buildNeedsHumanWithoutCommits(): FlowNode {
    return buildNeedsHumanOutput({
        id: "needs_human_without_commits",
        label: "Sem commits",
        cell: { column: 3, row: 2 },
        input: IMPLEMENTATION_INPUT,
    });
}

function buildReviewer(): FlowNode {
    return buildAgentStep({
        id: "reviewer",
        label: "Reviewer",
        cell: { column: 4 },
        prompt: "sandcastle_review",
        extraInput: IMPLEMENTATION_INPUT,
    });
}

function buildRebase(): FlowNode {
    const rebase = createTemplateNode("git", "rebase", { column: 5 });

    return {
        ...rebase,
        label: "Rebase",
        inputs: [...rebase.inputs, REVIEW_INPUT],
        config: { ...rebase.config, action: "rebase" },
    };
}

function buildEvidence(): FlowNode {
    return buildAgentStep({
        id: "evidence",
        label: "Evidence",
        cell: { column: 6 },
        prompt: "sandcastle_evidence",
        config: { outputSchema: EVIDENCE_OUTPUT_SCHEMA },
        extraInput: REBASE_INPUT,
    });
}

function buildChecksPassedCondition(): FlowNode {
    const condition = createTemplateNode("condition", "checks_passed", { column: 7 });

    return {
        ...condition,
        label: "Checks passaram?",
        config: { condition: { op: "eq", path: "checksPassed", value: true } },
    };
}

function buildOpenPullRequestWithEvidence(): FlowNode {
    const openPullRequest = buildOpenPullRequest({ column: 8 });

    return {
        ...openPullRequest,
        inputs: [...openPullRequest.inputs, EVIDENCE_INPUT],
        config: { ...openPullRequest.config, bodyFrom: EVIDENCE_BODY_PATH },
    };
}

function buildNeedsHumanAfterFailedChecks(): FlowNode {
    return buildNeedsHumanOutput({
        id: "needs_human_failed_checks",
        label: "Checks falharam",
        cell: { column: 8, row: 2 },
        input: EVIDENCE_INPUT,
    });
}

function buildAgentStep(step: AgentStep): NodeOfType<"agent"> {
    const agent = createAgentNode(step);

    return {
        ...agent,
        config: {
            ...agent.config,
            prompt: loadPrompt(step.prompt),
            workspace: "item",
            ...step.config,
        },
    };
}

// The issue hears why the item stopped: the input carries the result that explains it.
function buildNeedsHumanOutput(spec: {
    id: string;
    label: string;
    cell: CanvasCell;
    input: Port;
}): FlowNode {
    const output = buildOutput({ ...spec, moveItemTo: "needs_human" });

    return {
        ...output,
        inputs: [...output.inputs, spec.input],
        config: { ...output.config, commentOnIssue: true },
    };
}

function optionalJsonInput(name: string): Port {
    return { name, type: "json", required: false };
}
