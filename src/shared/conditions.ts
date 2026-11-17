import { z } from "zod";

import { assertNever } from "@/lib/assert_never.js";

export type Condition =
    | { op: "eq" | "neq"; path: string; value: string | number | boolean }
    | { op: "gt" | "lt" | "gte" | "lte"; path: string; value: number }
    | { op: "contains" | "notContains" | "startsWith"; path: string; value: string }
    | { op: "in"; path: string; values: (string | number)[] }
    | { op: "isEmpty" | "isNotEmpty" | "exists"; path: string }
    | { op: "minLength"; path: string; value: number }
    | { op: "and" | "or"; conditions: Condition[] }
    | { op: "not"; condition: Condition };

export type Comparison = Extract<Condition, { path: string }>;
export type ComparisonOperator = Comparison["op"];

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
    z.discriminatedUnion("op", [
        z.object({
            op: z.literal(["eq", "neq"]),
            path: z.string(),
            value: z.union([z.string(), z.number(), z.boolean()]),
        }),
        z.object({
            op: z.literal(["gt", "lt", "gte", "lte"]),
            path: z.string(),
            value: z.number(),
        }),
        z.object({
            op: z.literal(["contains", "notContains", "startsWith"]),
            path: z.string(),
            value: z.string(),
        }),
        z.object({
            op: z.literal("in"),
            path: z.string(),
            values: z.array(z.union([z.string(), z.number()])),
        }),
        z.object({ op: z.literal(["isEmpty", "isNotEmpty", "exists"]), path: z.string() }),
        z.object({ op: z.literal("minLength"), path: z.string(), value: z.number() }),
        z.object({ op: z.literal(["and", "or"]), conditions: z.array(conditionSchema) }),
        z.object({ op: z.literal("not"), condition: conditionSchema }),
    ]),
);

type PathLookup = { isFound: true; value: unknown } | { isFound: false };

export const CONDITION_PATH_SEPARATOR = ".";

export function evaluateCondition(condition: Condition, data: unknown): boolean {
    switch (condition.op) {
        case "and":
            return condition.conditions.every((inner) => evaluateCondition(inner, data));
        case "or":
            return condition.conditions.some((inner) => evaluateCondition(inner, data));
        case "not":
            return !evaluateCondition(condition.condition, data);
        default:
            return evaluateComparison(condition, lookUpPath(data, condition.path));
    }
}

/** Every comparison of the condition, however deep it is nested. */
export function listComparisons(condition: Condition): Comparison[] {
    switch (condition.op) {
        case "and":
        case "or":
            return condition.conditions.flatMap(listComparisons);
        case "not":
            return listComparisons(condition.condition);
        default:
            return [condition];
    }
}

// A missing value is empty, so only isEmpty holds for it.
function evaluateComparison(comparison: Comparison, lookup: PathLookup): boolean {
    if (!lookup.isFound) {
        return comparison.op === "isEmpty";
    }

    return compareValue(comparison, lookup.value);
}

// A value of the wrong type never satisfies a comparison: it is false, not an error.
function compareValue(comparison: Comparison, actual: unknown): boolean {
    switch (comparison.op) {
        case "eq":
            return actual === comparison.value;
        case "neq":
            return actual !== comparison.value;
        case "gt":
            return typeof actual === "number" && actual > comparison.value;
        case "gte":
            return typeof actual === "number" && actual >= comparison.value;
        case "lt":
            return typeof actual === "number" && actual < comparison.value;
        case "lte":
            return typeof actual === "number" && actual <= comparison.value;
        case "contains":
            return isContainer(actual) && containsValue(actual, comparison.value);
        case "notContains":
            return isContainer(actual) && !containsValue(actual, comparison.value);
        case "startsWith":
            return typeof actual === "string" && actual.startsWith(comparison.value);
        case "in":
            return comparison.values.some((value) => value === actual);
        case "isEmpty":
            return actual === null || measureSize(actual) === 0;
        case "isNotEmpty":
            return (measureSize(actual) ?? 0) > 0;
        case "minLength":
            return (measureLength(actual) ?? -1) >= comparison.value;
        case "exists":
            return true;
        default:
            return assertNever(comparison);
    }
}

function isContainer(value: unknown): value is string | unknown[] {
    return typeof value === "string" || Array.isArray(value);
}

// Texts contain substrings and lists contain elements.
function containsValue(container: string | unknown[], value: string): boolean {
    if (typeof container === "string") {
        return container.includes(value);
    }

    return container.some((element) => element === value);
}

function measureSize(value: unknown): number | undefined {
    if (isObject(value) && !Array.isArray(value)) {
        return Object.keys(value).length;
    }

    return measureLength(value);
}

function measureLength(value: unknown): number | undefined {
    if (typeof value === "string" || Array.isArray(value)) {
        return value.length;
    }

    return undefined;
}

export function lookUpPath(data: unknown, path: string): PathLookup {
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

export function listConditionPaths(condition: Condition): string[] {
    return listComparisons(condition).map((comparison) => comparison.path);
}
