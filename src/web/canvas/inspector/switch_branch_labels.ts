import type { SwitchConditionConfig } from "@/shared/node_configs/condition_config.js";

export const OTHERWISE_LABEL = "Senão";

/** The labels of the ways out of a switch, in the order of its ports. */
export function listSwitchBranchLabels(config: SwitchConditionConfig): string[] {
    const branchLabels = config.branches.map((branch) => branch.label);

    return config.otherwise ? [...branchLabels, OTHERWISE_LABEL] : branchLabels;
}
