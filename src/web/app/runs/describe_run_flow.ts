import type { RunListItem } from "@/shared/run_types.js";

export function describeRunFlow(run: RunListItem): string {
    return `${run.flowName} · v${run.flowVersion}`;
}
