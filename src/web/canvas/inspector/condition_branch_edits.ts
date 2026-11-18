import type { Condition } from "@/shared/conditions.js";
import { isNodeOfType } from "@/shared/flow_graph.js";
import type { FlowNode } from "@/shared/flow_graph.js";
import { branchPortsOf } from "@/shared/node_configs/condition_branches.js";
import { BRANCH_LABEL_MAX_LENGTH, MAX_BRANCHES } from "@/shared/node_configs/condition_config.js";
import type {
    ConditionConfig,
    IfConditionConfig,
    SwitchBranch,
    SwitchConditionConfig,
} from "@/shared/node_configs/condition_config.js";

const NEW_BRANCH_PORT_PREFIX = "branch";
const NEW_BRANCH_LABEL_PREFIX = "Caminho";
const FIRST_BRANCH_LABEL = "Sim";
const FIRST_NEW_BRANCH_NUMBER = 1;
const NO_RULES: Condition = { op: "and", conditions: [] };

/** The Decisão with the new config; its outputs always follow the branches. */
export function withDecisionConfig(node: FlowNode, config: ConditionConfig): FlowNode {
    if (!isNodeOfType(node, "condition")) {
        return node;
    }

    return { ...node, config, outputs: branchPortsOf(config) };
}

export function canAddBranch(config: SwitchConditionConfig): boolean {
    return config.branches.length < MAX_BRANCHES;
}

/** The config with a branch without rules at the end, on the first `branchN` port still free. */
export function withAddedBranch(config: SwitchConditionConfig): SwitchConditionConfig {
    const newBranch: SwitchBranch = {
        port: findFreeBranchPort(config.branches),
        label: `${NEW_BRANCH_LABEL_PREFIX} ${config.branches.length + 1}`,
        condition: NO_RULES,
    };

    return { ...config, branches: [...config.branches, newBranch] };
}

export function withMovedBranch(
    config: SwitchConditionConfig,
    fromIndex: number,
    toIndex: number,
): SwitchConditionConfig {
    const movedBranch = config.branches[fromIndex];
    if (!movedBranch || toIndex < 0 || toIndex >= config.branches.length) {
        return config;
    }

    const otherBranches = config.branches.filter((_branch, index) => index !== fromIndex);
    const branches = otherBranches.toSpliced(toIndex, 0, movedBranch);

    return { ...config, branches };
}

export function withoutBranch(config: SwitchConditionConfig, index: number): SwitchConditionConfig {
    return { ...config, branches: config.branches.filter((_branch, at) => at !== index) };
}

export function isValidBranchLabel(label: string): boolean {
    return label.trim() !== "";
}

/** The branch keeps its port, so its edges stay connected under the new name. */
export function withRenamedBranch(
    config: SwitchConditionConfig,
    index: number,
    label: string,
): SwitchConditionConfig {
    const fittingLabel = label.trim().slice(0, BRANCH_LABEL_MAX_LENGTH);

    return withEditedBranch(config, index, { label: fittingLabel });
}

export function withBranchCondition(
    config: SwitchConditionConfig,
    index: number,
    condition: Condition,
): SwitchConditionConfig {
    return withEditedBranch(config, index, { condition });
}

/** The yes/no rule becomes the first branch, Sim, and the rest goes to Senão. */
export function toSwitchConfig({ condition }: IfConditionConfig): SwitchConditionConfig {
    const firstBranch: SwitchBranch = {
        port: findFreeBranchPort([]),
        label: FIRST_BRANCH_LABEL,
        condition,
    };

    return { mode: "switch", branches: [firstBranch], otherwise: true };
}

/** Only the first branch fits a yes/no decision; the others are dropped. */
export function toIfConfig({ branches }: SwitchConditionConfig): IfConditionConfig {
    const [firstBranch] = branches;

    return { mode: "if", condition: firstBranch?.condition ?? NO_RULES };
}

function withEditedBranch(
    config: SwitchConditionConfig,
    index: number,
    changes: Partial<SwitchBranch>,
): SwitchConditionConfig {
    const branches = config.branches.map((branch, at) =>
        at === index ? { ...branch, ...changes } : branch,
    );

    return { ...config, branches };
}

function findFreeBranchPort(branches: SwitchBranch[]): string {
    const usedPorts = new Set(branches.map((branch) => branch.port));
    let number = FIRST_NEW_BRANCH_NUMBER;
    while (usedPorts.has(`${NEW_BRANCH_PORT_PREFIX}${number}`)) {
        number += 1;
    }

    return `${NEW_BRANCH_PORT_PREFIX}${number}`;
}
