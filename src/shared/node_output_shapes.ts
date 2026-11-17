import type { NodeType } from "@/shared/flow_graph.js";
import type { JsonSchema } from "@/shared/json_schema.js";

type OutputShapesByPort = Record<string, JsonSchema>;

/** The fields of `WorkItemSnapshot`, which is also what `item.*` reads. */
export const WORK_ITEM_SHAPE: JsonSchema = {
    type: "object",
    properties: {
        id: { type: "string", description: "Identificador do item na Forja." },
        title: { type: "string", description: "Título do item." },
        body: { type: "string", description: "Descrição do item." },
        number: { type: "integer", description: "Número da issue no GitHub." },
        url: { type: "string", description: "Endereço da issue no GitHub." },
        labels: { type: "array", items: { type: "string" }, description: "Etiquetas do item." },
        branch: { type: "string", description: "Branch de trabalho do item." },
    },
};

export const WORK_ITEM_LIST_SHAPE: JsonSchema = { type: "array", items: WORK_ITEM_SHAPE };

const GIT_RESULT_SHAPE: JsonSchema = {
    type: "object",
    properties: {
        branch: { type: "string", description: "Branch em que o trabalho foi publicado." },
        prUrl: { type: "string", description: "Endereço do pull request, quando aberto." },
        pushed: { type: "boolean", description: "Se o branch foi enviado ao GitHub." },
    },
};

const SCRIPT_RESULT_SHAPE: JsonSchema = {
    type: "object",
    properties: {
        exitCode: { type: "integer", description: "Código de saída do comando; 0 é sucesso." },
        passed: { type: "boolean", description: "Se o comando terminou com código 0." },
        stdout: { type: "string", description: "Últimas 200 linhas da saída do comando." },
        stderr: { type: "string", description: "Últimas 200 linhas dos erros do comando." },
        durationMs: { type: "integer", description: "Quanto o comando demorou, em milissegundos." },
        data: { type: "object", description: "O JSON lido da saída, quando pedido." },
    },
};

const SCRIPT_OUTPUT_SHAPE: JsonSchema = {
    type: "string",
    description: "Últimas 200 linhas da saída do comando.",
};

const NODE_OUTPUT_SHAPES: Partial<Record<NodeType, OutputShapesByPort>> = {
    trigger: { items: WORK_ITEM_LIST_SHAPE },
    source: { items: WORK_ITEM_LIST_SHAPE },
    script: { result: SCRIPT_RESULT_SHAPE, output: SCRIPT_OUTPUT_SHAPE },
    git: { result: GIT_RESULT_SHAPE },
};

/** The fixed shape a deterministic node gives one of its outputs, if it has one. */
export function findNodeOutputShape(nodeType: NodeType, portName: string): JsonSchema | undefined {
    return NODE_OUTPUT_SHAPES[nodeType]?.[portName];
}
