import { assertNever } from "@/lib/assert_never.js";
import type { Effort } from "@/shared/agent_types.js";
import type { FlowGroup, FlowNode, NodeOfType } from "@/shared/flow_graph.js";
import type { AgentConfig } from "@/shared/node_configs/agent_config.js";
import type { GitConfig } from "@/shared/node_configs/git_config.js";
import type { OutputConfig } from "@/shared/node_configs/output_config.js";
import type { SourceConfig } from "@/shared/node_configs/source_config.js";
import type { TriggerConfig } from "@/shared/node_configs/trigger_config.js";
import { conditionToText } from "@/web/canvas/inspector/condition_text.js";

interface NodeSummary {
    line1: string;
    line2?: string;
}

interface AgentDefaults {
    model: string;
    effort: Effort;
}

const SUMMARY_MAX_LENGTH = 40;
const ELLIPSIS = "…";
const PART_SEPARATOR = " · ";
const DISPLAYED_MODEL_PREFIX = "claude-";
const INHERITED_LABEL = "padrão";

const WORKSPACE_LABELS: Record<AgentConfig["workspace"], string> = {
    item: "workspace do item",
    none: "sem workspace",
};

const TRIGGER_KIND_LABELS: Record<TriggerConfig["kind"], string> = {
    manual: "manual",
    schedule: "agendado",
    event: "por evento",
    webhook: "webhook",
    board_column: "coluna do board",
};

const SOURCE_PROVIDER_LABELS: Record<SourceConfig["provider"], string> = {
    github: "GitHub",
    local: "Local",
};

const GIT_ACTION_LABELS: Record<GitConfig["action"], string> = {
    rebase: "rebase",
    push: "push",
    open_pr: "abrir PR",
};

const ITEM_DESTINATION_LABELS: Record<NonNullable<OutputConfig["moveItemTo"]>, string> = {
    done: "Concluído",
    needs_human: "Precisa de humano",
};

export function summarizeNode(node: FlowNode, defaults?: AgentDefaults): NodeSummary {
    switch (node.type) {
        case "agent":
            return summarizeAgent(node, defaults);
        case "script":
            return { line1: truncate(node.config.command) };
        case "condition":
            return { line1: conditionToText(node.config.condition) };
        case "gate":
            return { line1: truncate(node.config.message) };
        case "git":
            return { line1: describeGitAction(node.config) };
        case "source":
            return { line1: describeSource(node.config) };
        case "trigger":
            return { line1: TRIGGER_KIND_LABELS[node.config.kind] };
        case "output":
            return summarizeOutput(node.config);
        default:
            return assertNever(node);
    }
}

export function describeGroupConfig(group: FlowGroup): string {
    switch (group.kind) {
        case "map":
            return joinParts([
                `map ×${group.config.concurrency}`,
                group.config.barrier ? "barreira" : undefined,
            ]);
        case "loop":
            return `loop ≤${group.config.maxIterations}`;
        default:
            return assertNever(group);
    }
}

function summarizeAgent(agent: NodeOfType<"agent">, defaults?: AgentDefaults): NodeSummary {
    const { model, effort, workspace, maxIterations } = agent.config;
    const modelText = describeSetting(model, defaults?.model);
    const effortText = describeSetting(effort, defaults?.effort);

    return {
        line1: joinParts([formatModelName(modelText), `effort ${effortText}`]),
        line2: joinParts([WORKSPACE_LABELS[workspace], describeIterationCap(maxIterations)]),
    };
}

function describeSetting(nodeSetting?: string, projectSetting?: string): string {
    if (nodeSetting !== undefined) {
        return nodeSetting;
    }
    if (projectSetting === undefined) {
        return INHERITED_LABEL;
    }

    return `${projectSetting} (${INHERITED_LABEL})`;
}

function formatModelName(model: string): string {
    return model.startsWith(DISPLAYED_MODEL_PREFIX)
        ? model.slice(DISPLAYED_MODEL_PREFIX.length)
        : model;
}

function describeIterationCap(maxIterations: number): string {
    const unit = maxIterations === 1 ? "iteração" : "iterações";

    return `até ${maxIterations} ${unit}`;
}

function describeGitAction({ action, baseBranch }: GitConfig): string {
    const actionLabel = GIT_ACTION_LABELS[action];

    return baseBranch === undefined ? actionLabel : `${actionLabel} → ${baseBranch}`;
}

function describeSource({ provider, label, limit }: SourceConfig): string {
    return joinParts([
        SOURCE_PROVIDER_LABELS[provider],
        label === undefined ? undefined : `label ${label}`,
        `até ${limit}`,
    ]);
}

function summarizeOutput({ moveItemTo, commentOnIssue }: OutputConfig): NodeSummary {
    const line1 =
        moveItemTo === undefined
            ? "item fica onde está"
            : `mover para ${ITEM_DESTINATION_LABELS[moveItemTo]}`;
    if (!commentOnIssue) {
        return { line1 };
    }

    return { line1, line2: "comenta na issue" };
}

function truncate(text: string): string {
    if (text.length <= SUMMARY_MAX_LENGTH) {
        return text;
    }

    return text.slice(0, SUMMARY_MAX_LENGTH - ELLIPSIS.length) + ELLIPSIS;
}

function joinParts(parts: (string | undefined)[]): string {
    return parts.filter((part) => part !== undefined).join(PART_SEPARATOR);
}
