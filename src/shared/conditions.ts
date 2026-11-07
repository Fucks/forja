import { z } from "zod";

import { assertNever } from "@/lib/assert_never.js";

export type Condition =
    | { op: "eq" | "neq"; path: string; value: string | number | boolean }
    | { op: "gt" | "lt"; path: string; value: number }
    | { op: "exists"; path: string }
    | { op: "and" | "or"; conditions: Condition[] }
    | { op: "not"; condition: Condition };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
    z.discriminatedUnion("op", [
        z.object({
            op: z.literal(["eq", "neq"]),
            path: z.string(),
            value: z.union([z.string(), z.number(), z.boolean()]),
        }),
        z.object({ op: z.literal(["gt", "lt"]), path: z.string(), value: z.number() }),
        z.object({ op: z.literal("exists"), path: z.string() }),
        z.object({ op: z.literal(["and", "or"]), conditions: z.array(conditionSchema) }),
        z.object({ op: z.literal("not"), condition: conditionSchema }),
    ]),
);

type PathLookup = { isFound: true; value: unknown } | { isFound: false };

export const CONDITION_PATH_SEPARATOR = ".";

export function evaluateCondition(condition: Condition, data: unknown): boolean {
    switch (condition.op) {
        case "eq":
        case "neq":
        case "gt":
        case "lt":
        case "exists":
            return evaluateComparison(condition, lookUpPath(data, condition.path));
        case "and":
            return condition.conditions.every((inner) => evaluateCondition(inner, data));
        case "or":
            return condition.conditions.some((inner) => evaluateCondition(inner, data));
        case "not":
            return !evaluateCondition(condition.condition, data);
        default:
            return assertNever(condition);
    }
}

type Comparison = Extract<Condition, { path: string }>;

function evaluateComparison(comparison: Comparison, lookup: PathLookup): boolean {
    if (!lookup.isFound) {
        return false;
    }

    const actual = lookup.value;
    switch (comparison.op) {
        case "eq":
            return actual === comparison.value;
        case "neq":
            return actual !== comparison.value;
        case "gt":
            return typeof actual === "number" && actual > comparison.value;
        case "lt":
            return typeof actual === "number" && actual < comparison.value;
        case "exists":
            return true;
        default:
            return assertNever(comparison);
    }
}

function lookUpPath(data: unknown, path: string): PathLookup {
    const root: PathLookup = { isFound: true, value: data };

    return path.split(CONDITION_PATH_SEPARATOR).reduce(lookUpKey, root);
}

function lookUpKey(parent: PathLookup, key: string): PathLookup {
    if (!parent.isFound || !isObject(parent.value) || !Object.hasOwn(parent.value, key)) {
        return { isFound: false };
    }

    return { isFound: true, value: Reflect.get(parent.value, key) };
}

function isObject(value: unknown): value is object {
    return typeof value === "object" && value !== null;
}
