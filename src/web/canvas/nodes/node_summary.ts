import { assertNever } from "@/lib/assert_never.js";
import type { DataField } from "@/engine/available_data.js";
import type { Effort } from "@/shared/agent_types.js";
import type { FlowGroup, FlowNode, NodeOfType } from "@/shared/flow_graph.js";
import type { AgentConfig } from "@/shared/node_configs/agent_config.js";
import type {
    ConditionConfig,
    SwitchConditionConfig,
} from "@/shared/node_configs/condition_config.js";
import type { GitConfig } from "@/shared/node_configs/git_config.js";
import type { OutputConfig } from "@/shared/node_configs/output_config.js";
import type { ScriptConfig } from "@/shared/node_configs/script_config.js";
import type { SourceConfig } from "@/shared/node_configs/source_config.js";
import type { TriggerConfig } from "@/shared/node_configs/trigger_config.js";
import { conditionToSentence } from "@/web/canvas/inspector/condition_text.js";
import { listSwitchBranchLabels } from "@/web/canvas/inspector/switch_branch_labels.js";

interface NodeSummary {
    line1: string;
    line2?: string;
}

interface AgentDefaults {
    model: string;
    effort: Effort;
}

/** What the summary needs beyond the node: the project's agent defaults and the data it reads. */
interface SummaryContext {
    agentDefaults?: AgentDefaults;
    dataFields?: DataField[];
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

const SCRIPT_RUN_LOCATION_LABELS: Record<ScriptConfig["runIn"], string> = {
    item: "container do item",
    isolated: "container isolado",
};

const SCRIPT_FAILURE_POLICY_LABELS: Record<ScriptConfig["onFailure"], string> = {
    fail: "falha se ≠ 0",
    continue: "continua se ≠ 0",
};

const TRIGGER_SUMMARIES: Record<TriggerConfig["kind"], string> = {
    manual: "Dispara manualmente",
    schedule: "Dispara no horário agendado",
    event: "Dispara quando acontece um evento",
    webhook: "Dispara por webhook",
    board_column: "Dispara quando um item entra na coluna do board",
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

export function summarizeNode(
    node: FlowNode,
    { agentDefaults, dataFields = [] }: SummaryContext = {},
): NodeSummary {
    switch (node.type) {
        case "agent":
            return summarizeAgent(node, agentDefaults);
        case "script":
            return summarizeScript(node.config);
        case "condition":
            return { line1: summarizeDecision(node.config, dataFields) };
        case "gate":
            return { line1: truncate(node.config.message) };
        case "git":
            return { line1: describeGitAction(node.config) };
        case "source":
            return { line1: describeSource(node.config) };
        case "trigger":
            return { line1: TRIGGER_SUMMARIES[node.config.kind] };
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

function summarizeDecision(config: ConditionConfig, dataFields: DataField[]): string {
    switch (config.mode) {
        case "if":
            return conditionToSentence(config.condition, dataFields);
        case "switch":
            return describeSwitchPaths(config);
        default:
            return assertNever(config);
    }
}

function describeSwitchPaths(config: SwitchConditionConfig): string {
    const branchCount = config.branches.length;
    const pathWord = branchCount === 1 ? "caminho" : "caminhos";
    const labels = listSwitchBranchLabels(config).join(PART_SEPARATOR);

    return `${branchCount} ${pathWord}: ${labels}`;
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

function summarizeScript({ command, runIn, onFailure }: ScriptConfig): NodeSummary {
    return {
        line1: truncate(command),
        line2: joinParts([
            SCRIPT_RUN_LOCATION_LABELS[runIn],
            SCRIPT_FAILURE_POLICY_LABELS[onFailure],
        ]),
    };
}

function describeGitAction({ action, baseBranch }: GitConfig): string {
    const actionLabel = GIT_ACTION_LABELS[action];

    return baseBranch === undefined ? actionLabel : `${actionLabel} → ${baseBranch}`;
}

function describeSource({ provider, label, limit }: SourceConfig): string {
    return joinParts([
        SOURCE_PROVIDER_LABELS[provider],
        label === undefined ? undefined : `label ${label}`,
        describeItemLimit(limit),
    ]);
}

function describeItemLimit(limit: number): string {
    const unit = limit === 1 ? "item" : "itens";

    return `até ${limit} ${unit}`;
}

function summarizeOutput({ moveItemTo, commentOnIssue }: OutputConfig): NodeSummary {
    const line1 =
        moveItemTo === undefined
            ? "Deixa o item onde está"
            : `Move para ${ITEM_DESTINATION_LABELS[moveItemTo]}`;
    if (!commentOnIssue) {
        return { line1 };
    }

    return { line1, line2: "Comenta na issue" };
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
