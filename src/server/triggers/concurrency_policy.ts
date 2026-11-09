import { assertNever } from "@/lib/assert_never.js";
import type { Trigger } from "@/shared/trigger_types.js";

export type PolicyDecision = "start" | "skip" | "enqueue";

export function decidePolicy(policy: Trigger["policy"], activeRunIds: string[]): PolicyDecision {
    if (activeRunIds.length === 0) {
        return "start";
    }

    switch (policy) {
        case "skip":
            return "skip";
        case "queue":
            return "enqueue";
        case "parallel":
            return "start";
        default:
            return assertNever(policy);
    }
}
