import { z } from "zod";

import {
    flowGroupSchema,
    LOOP_EXHAUSTED_PORT,
    loopConfigSchema,
    mapConfigSchema,
    NODE_TYPES,
} from "@/shared/flow_graph.js";
import { agentConfigSchema } from "@/shared/node_configs/agent_config.js";
import { conditionConfigSchema } from "@/shared/node_configs/condition_config.js";
import { gateConfigSchema } from "@/shared/node_configs/gate_config.js";
import { gitConfigSchema } from "@/shared/node_configs/git_config.js";
import { outputConfigSchema } from "@/shared/node_configs/output_config.js";
import { scriptConfigSchema } from "@/shared/node_configs/script_config.js";
import { sourceConfigSchema } from "@/shared/node_configs/source_config.js";
import { triggerConfigSchema } from "@/shared/node_configs/trigger_config.js";
import { createDefaultNode } from "@/shared/node_defaults.js";
import type { DocumentedType, NodeDoc, PortDoc } from "@/web/docs/node_docs/node_doc.js";
import { getNodeDoc, NODE_DOCS } from "@/web/docs/node_docs/node_docs.js";

type PortSignature = Pick<PortDoc, "name" | "type" | "required">;

interface ExpectedPorts {
    inputs: PortSignature[];
    outputs: PortSignature[];
}

const MAX_TAGLINE_LENGTH = 70;

const GROUP_KINDS = flowGroupSchema.options.map((option) => option.shape.kind.value);
const DOCUMENTED_TYPES: DocumentedType[] = [...NODE_TYPES, ...GROUP_KINDS];

const CONFIG_SCHEMAS: Record<DocumentedType, z.ZodObject> = {
    trigger: triggerConfigSchema,
    source: sourceConfigSchema,
    agent: agentConfigSchema,
    script: scriptConfigSchema,
    condition: conditionConfigSchema,
    gate: gateConfigSchema,
    git: gitConfigSchema,
    output: outputConfigSchema,
    map: mapConfigSchema,
    loop: loopConfigSchema,
};

const GROUP_PORTS: Record<(typeof GROUP_KINDS)[number], ExpectedPorts> = {
    map: { inputs: [], outputs: [] },
    loop: {
        inputs: [],
        outputs: [{ name: LOOP_EXHAUSTED_PORT, type: "loopExhausted", required: false }],
    },
};

describe("NODE_DOCS", () => {
    it.each(DOCUMENTED_TYPES)("has the %s documentation", (type) => {
        expect(getNodeDoc(type).type).toBe(type);
    });

    describe.each(DOCUMENTED_TYPES)("%s", (type) => {
        const doc = NODE_DOCS[type];
        const configSchema = CONFIG_SCHEMAS[type];

        it("documents every config field", () => {
            expect(findUndocumentedFields(doc, configSchema)).toEqual([]);
        });

        it("documents every default port with its type and whether it is required", () => {
            expect(findUndocumentedPorts(doc, expectedPortsOf(type))).toEqual([]);
        });

        it("documents every value of each enum field", () => {
            expect(findUndocumentedOptions(doc, configSchema)).toEqual([]);
        });

        it("has a short tagline, an example and a common pitfall", () => {
            expect(doc.tagline.length).toBeLessThanOrEqual(MAX_TAGLINE_LENGTH);
            expect(doc.examples.length).toBeGreaterThan(0);
            expect(doc.pitfalls.length).toBeGreaterThan(0);
        });
    });

    it("reports what an incomplete documentation is missing", () => {
        const incompleteDoc: NodeDoc = {
            ...NODE_DOCS.git,
            ports: { inputs: [], outputs: [] },
            fields: [{ key: "action", label: "Ação", description: "O que fazer." }],
        };

        const undocumentedFields = findUndocumentedFields(incompleteDoc, gitConfigSchema);
        const undocumentedPorts = findUndocumentedPorts(incompleteDoc, expectedPortsOf("git"));
        const undocumentedOptions = findUndocumentedOptions(incompleteDoc, gitConfigSchema);

        expect(undocumentedFields).toEqual(["baseBranch", "draft", "bodyFrom"]);
        expect(undocumentedPorts.map((port) => port.name)).toEqual(["item", "body", "result"]);
        expect(undocumentedOptions).toEqual(["action.rebase", "action.push", "action.open_pr"]);
    });
});

function findUndocumentedFields(doc: NodeDoc, configSchema: z.ZodObject): string[] {
    const documentedKeys = new Set(doc.fields.map((field) => field.key));

    return Object.keys(configSchema.shape).filter((key) => !documentedKeys.has(key));
}

function findUndocumentedPorts(doc: NodeDoc, expected: ExpectedPorts): PortSignature[] {
    return [
        ...expected.inputs.filter((port) => !hasMatchingPort(doc.ports.inputs, port)),
        ...expected.outputs.filter((port) => !hasMatchingPort(doc.ports.outputs, port)),
    ];
}

function hasMatchingPort(documentedPorts: PortDoc[], expected: PortSignature): boolean {
    return documentedPorts.some(
        (port) =>
            port.name === expected.name &&
            port.type === expected.type &&
            port.required === expected.required,
    );
}

function findUndocumentedOptions(doc: NodeDoc, configSchema: z.ZodObject): string[] {
    return Object.entries(configSchema.shape).flatMap(([key, fieldSchema]) => {
        const field = doc.fields.find((fieldDoc) => fieldDoc.key === key);
        const documentedValues = new Set(field?.options?.map((option) => option.value));

        return enumValuesOf(fieldSchema)
            .filter((value) => !documentedValues.has(value))
            .map((value) => `${key}.${value}`);
    });
}

function enumValuesOf(fieldSchema: unknown): string[] {
    if (fieldSchema instanceof z.ZodEnum) {
        return fieldSchema.options.map(String);
    }
    if (fieldSchema instanceof z.ZodOptional || fieldSchema instanceof z.ZodDefault) {
        return enumValuesOf(fieldSchema.unwrap());
    }
    if (fieldSchema instanceof z.ZodArray) {
        return enumValuesOf(fieldSchema.element);
    }

    return [];
}

function expectedPortsOf(type: DocumentedType): ExpectedPorts {
    if (type === "map" || type === "loop") {
        return GROUP_PORTS[type];
    }

    const node = createDefaultNode(type, "documented", { x: 0, y: 0 });

    return { inputs: node.inputs.map(toPortSignature), outputs: node.outputs.map(toPortSignature) };
}

function toPortSignature({ name, type, required }: PortSignature): PortSignature {
    return { name, type, required };
}
