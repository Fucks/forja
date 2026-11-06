import { z } from "zod";

import { conditionSchema } from "@/shared/conditions.js";
import { jsonSchemaSchema } from "@/shared/json_schema.js";
import { agentConfigSchema } from "@/shared/node_configs/agent_config.js";
import { conditionConfigSchema } from "@/shared/node_configs/condition_config.js";
import { gateConfigSchema } from "@/shared/node_configs/gate_config.js";
import { gitConfigSchema } from "@/shared/node_configs/git_config.js";
import { outputConfigSchema } from "@/shared/node_configs/output_config.js";
import { scriptConfigSchema } from "@/shared/node_configs/script_config.js";
import { sourceConfigSchema } from "@/shared/node_configs/source_config.js";
import { triggerConfigSchema } from "@/shared/node_configs/trigger_config.js";

export const PORT_TYPES = [
    "text",
    "json",
    "workItem",
    "workItemList",
    "branch",
    "prUrl",
    "any",
] as const;
export type PortType = (typeof PORT_TYPES)[number];

const PORT_NAME_PATTERN = /^[a-z][a-zA-Z0-9_]*$/;

export const portSchema = z.object({
    name: z.string().regex(PORT_NAME_PATTERN),
    type: z.enum(PORT_TYPES),
    required: z.boolean().default(true),
    schema: jsonSchemaSchema.optional(),
});
export type Port = z.infer<typeof portSchema>;

export const NODE_TYPES = [
    "trigger",
    "source",
    "agent",
    "script",
    "condition",
    "gate",
    "git",
    "output",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

const positionSchema = z.object({ x: z.number(), y: z.number() });
export type Position = z.infer<typeof positionSchema>;

const sizeSchema = z.object({ width: z.number().positive(), height: z.number().positive() });

const nodeFieldsSchema = z.object({
    id: z.string(),
    label: z.string(),
    position: positionSchema,
    parentGroupId: z.string().optional(),
    inputs: z.array(portSchema),
    outputs: z.array(portSchema),
});

export const flowNodeSchema = z.discriminatedUnion("type", [
    nodeFieldsSchema.extend({ type: z.literal("trigger"), config: triggerConfigSchema }),
    nodeFieldsSchema.extend({ type: z.literal("source"), config: sourceConfigSchema }),
    nodeFieldsSchema.extend({ type: z.literal("agent"), config: agentConfigSchema }),
    nodeFieldsSchema.extend({ type: z.literal("script"), config: scriptConfigSchema }),
    nodeFieldsSchema.extend({ type: z.literal("condition"), config: conditionConfigSchema }),
    nodeFieldsSchema.extend({ type: z.literal("gate"), config: gateConfigSchema }),
    nodeFieldsSchema.extend({ type: z.literal("git"), config: gitConfigSchema }),
    nodeFieldsSchema.extend({ type: z.literal("output"), config: outputConfigSchema }),
]);
export type FlowNode = z.infer<typeof flowNodeSchema>;
export type NodeOfType<Type extends NodeType> = Extract<FlowNode, { type: Type }>;

const portReferenceSchema = z.object({ nodeId: z.string(), port: z.string() });

export const flowEdgeSchema = z.object({
    id: z.string(),
    from: portReferenceSchema,
    to: portReferenceSchema,
});
export type FlowEdge = z.infer<typeof flowEdgeSchema>;

const MIN_MAP_CONCURRENCY = 1;
const MAX_MAP_CONCURRENCY = 16;
const DEFAULT_MAP_CONCURRENCY = 1;
const MIN_LOOP_ITERATIONS = 1;
const MAX_LOOP_ITERATIONS = 50;
const DEFAULT_LOOP_ITERATIONS = 3;

export const mapConfigSchema = z.object({
    concurrency: z
        .number()
        .int()
        .min(MIN_MAP_CONCURRENCY)
        .max(MAX_MAP_CONCURRENCY)
        .default(DEFAULT_MAP_CONCURRENCY),
    barrier: z.boolean().default(false),
    failFast: z.boolean().default(false),
});
export type MapConfig = z.infer<typeof mapConfigSchema>;

export const loopConfigSchema = z.object({
    maxIterations: z
        .number()
        .int()
        .min(MIN_LOOP_ITERATIONS)
        .max(MAX_LOOP_ITERATIONS)
        .default(DEFAULT_LOOP_ITERATIONS),
    until: conditionSchema,
    carry: z.array(z.string()).default([]),
});
export type LoopConfig = z.infer<typeof loopConfigSchema>;

const groupFieldsSchema = z.object({
    id: z.string(),
    label: z.string(),
    parentGroupId: z.string().optional(),
    position: positionSchema,
    size: sizeSchema,
});

export const flowGroupSchema = z.discriminatedUnion("kind", [
    groupFieldsSchema.extend({ kind: z.literal("map"), config: mapConfigSchema }),
    groupFieldsSchema.extend({ kind: z.literal("loop"), config: loopConfigSchema }),
]);
export type FlowGroup = z.infer<typeof flowGroupSchema>;

export const flowGraphSchema = z.object({
    schemaVersion: z.literal(1),
    nodes: z.array(flowNodeSchema),
    edges: z.array(flowEdgeSchema),
    groups: z.array(flowGroupSchema),
});
export type FlowGraph = z.infer<typeof flowGraphSchema>;

export interface FlowGraphParseIssue {
    path: string;
    message: string;
}

export class FlowGraphParseError extends Error {
    constructor(readonly issues: FlowGraphParseIssue[]) {
        super(describeParseIssues(issues));
        this.name = "FlowGraphParseError";
    }
}

export function parseFlowGraph(input: unknown): FlowGraph {
    const result = flowGraphSchema.safeParse(input);
    if (!result.success) {
        throw new FlowGraphParseError(result.error.issues.map(toFlowGraphParseIssue));
    }

    return result.data;
}

const ROOT_PATH_LABEL = "(raiz)";

function toFlowGraphParseIssue(issue: z.core.$ZodIssue): FlowGraphParseIssue {
    const path = issue.path.map(String).join(".");

    return { path: path || ROOT_PATH_LABEL, message: issue.message };
}

function describeParseIssues(issues: FlowGraphParseIssue[]): string {
    const lines = issues.map((issue) => `- ${issue.path}: ${issue.message}`);

    return ["Grafo de fluxo inválido:", ...lines].join("\n");
}
