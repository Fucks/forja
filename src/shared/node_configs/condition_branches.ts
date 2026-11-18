import { assertNever } from "@/lib/assert_never.js";
import { evaluateCondition } from "@/shared/conditions.js";
import type { Condition } from "@/shared/conditions.js";
import type { Port } from "@/shared/flow_graph.js";
import { OTHERWISE_PORT } from "@/shared/node_configs/condition_config.js";
import type {
    ConditionConfig,
    SwitchConditionConfig,
} from "@/shared/node_configs/condition_config.js";

export const TRUE_BRANCH_PORT = "true";
export const FALSE_BRANCH_PORT = "false";

/** The outputs of a Decisão: Sim and Não, or one per branch in order and then Senão. */
export function branchPortsOf(config: ConditionConfig): Port[] {
    switch (config.mode) {
        case "if":
            return [branchPort(TRUE_BRANCH_PORT), branchPort(FALSE_BRANCH_PORT)];
        case "switch":
            return listSwitchPortNames(config).map(branchPort);
        default:
            return assertNever(config);
    }
}

/** Every condition the Decisão evaluates, in the order it evaluates them. */
export function listDecisionConditions(config: ConditionConfig): Condition[] {
    switch (config.mode) {
        case "if":
            return [config.condition];
        case "switch":
            return config.branches.map((branch) => branch.condition);
        default:
            return assertNever(config);
    }
}

/** The port the item leaves through; undefined when no branch holds and there is no Senão. */
export function chooseBranchPort(config: ConditionConfig, data: unknown): string | undefined {
    switch (config.mode) {
        case "if":
            return evaluateCondition(config.condition, data) ? TRUE_BRANCH_PORT : FALSE_BRANCH_PORT;
        case "switch":
            return chooseSwitchPort(config, data);
        default:
            return assertNever(config);
    }
}

function listSwitchPortNames(config: SwitchConditionConfig): string[] {
    const branchPortNames = config.branches.map((branch) => branch.port);

    return config.otherwise ? [...branchPortNames, OTHERWISE_PORT] : branchPortNames;
}

function chooseSwitchPort(config: SwitchConditionConfig, data: unknown): string | undefined {
    const firstTrueBranch = config.branches.find((branch) =>
        evaluateCondition(branch.condition, data),
    );
    if (firstTrueBranch) {
        return firstTrueBranch.port;
    }

    return config.otherwise ? OTHERWISE_PORT : undefined;
}

function branchPort(name: string): Port {
    return { name, type: "any", required: true };
}
