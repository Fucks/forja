export const FLOW_SCHEMA_VERSION = 2;
const SCHEMA_VERSION_WITH_PATH_DIALECTS = 1;

// In v1 each reader had its own path dialect; v2 reads every path from the DataContext.
const CONDITION_VALUE_PATH_PREFIX = "inputs.value.";
const LOOP_NODES_PATH_PREFIX = "nodes.";
const GIT_INPUTS_PATH_PREFIX = "inputs.";

type JsonObject = Record<string, unknown>;

interface FlowGraphV1 extends JsonObject {
    nodes: unknown[];
    groups: unknown[];
}

type ConfigMigration = (config: JsonObject) => JsonObject;

const NODE_CONFIG_MIGRATIONS: Partial<Record<string, ConfigMigration>> = {
    condition: migrateConditionConfig,
    git: migrateGitConfig,
};

const GROUP_CONFIG_MIGRATIONS: Partial<Record<string, ConfigMigration>> = {
    loop: migrateLoopConfig,
};

/** Takes any JSON: a v1 graph comes back as its v2 equivalent, anything else unchanged. */
export function migrateFlowGraph(input: unknown): unknown {
    if (!isFlowGraphV1(input)) {
        return input;
    }

    return {
        ...input,
        schemaVersion: FLOW_SCHEMA_VERSION,
        nodes: input.nodes.map((node) => migrateConfigOf(node, "type", NODE_CONFIG_MIGRATIONS)),
        groups: input.groups.map((group) =>
            migrateConfigOf(group, "kind", GROUP_CONFIG_MIGRATIONS),
        ),
    };
}

function isFlowGraphV1(input: unknown): input is FlowGraphV1 {
    return (
        isJsonObject(input) &&
        input.schemaVersion === SCHEMA_VERSION_WITH_PATH_DIALECTS &&
        Array.isArray(input.nodes) &&
        Array.isArray(input.groups)
    );
}

function migrateConfigOf(
    element: unknown,
    discriminator: "type" | "kind",
    migrations: Partial<Record<string, ConfigMigration>>,
): unknown {
    if (!isJsonObject(element) || !isJsonObject(element.config)) {
        return element;
    }

    const migrateConfig = migrations[String(element[discriminator])];
    if (!migrateConfig) {
        return element;
    }

    return { ...element, config: migrateConfig(element.config) };
}

function migrateConditionConfig(config: JsonObject): JsonObject {
    return {
        ...config,
        condition: prefixConditionPaths(config.condition, CONDITION_VALUE_PATH_PREFIX),
    };
}

function migrateLoopConfig(config: JsonObject): JsonObject {
    return { ...config, until: prefixConditionPaths(config.until, LOOP_NODES_PATH_PREFIX) };
}

function migrateGitConfig(config: JsonObject): JsonObject {
    if (typeof config.bodyFrom !== "string") {
        return config;
    }

    return { ...config, bodyFrom: prefixPath(config.bodyFrom, GIT_INPUTS_PATH_PREFIX) };
}

function prefixConditionPaths(condition: unknown, prefix: string): unknown {
    if (!isJsonObject(condition)) {
        return condition;
    }
    if (typeof condition.path === "string") {
        return { ...condition, path: prefixPath(condition.path, prefix) };
    }
    if (Array.isArray(condition.conditions)) {
        const conditions = condition.conditions.map((inner) => prefixConditionPaths(inner, prefix));
        return { ...condition, conditions };
    }
    if (Object.hasOwn(condition, "condition")) {
        return { ...condition, condition: prefixConditionPaths(condition.condition, prefix) };
    }

    return condition;
}

// A blank path is a rule the user has not filled in yet; it stays blank so validation still flags it.
function prefixPath(path: string, prefix: string): string {
    if (path.trim() === "") {
        return path;
    }

    return `${prefix}${path}`;
}

function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
