import { errorIssue, nodeTarget, quote } from "@/engine/validation_rules/validation_issues.js";
import { type FlowGraph, isNodeOfType, type NodeOfType } from "@/shared/flow_graph.js";
import type { ValidationIssue } from "@/shared/validation_issue.js";

type ScriptNode = NodeOfType<"script">;

export function findScriptConfigProblems(graph: FlowGraph): ValidationIssue[] {
    const scripts = graph.nodes.filter((node) => isNodeOfType(node, "script"));

    return scripts.flatMap((script) => [
        ...findEmptyCommand(script),
        ...findImageWithoutIsolatedContainer(script),
        ...findDuplicateEnvVars(script),
    ]);
}

function findEmptyCommand(script: ScriptNode): ValidationIssue[] {
    if (script.config.command.trim() !== "") {
        return [];
    }

    return [
        errorIssue({
            code: "empty_command",
            message: `O Comando ${quote(script.label)} não tem o que rodar.`,
            fix: "Escreva o comando em Configurar › Comando ou escolha um dos atalhos.",
            fieldKey: "command",
            target: nodeTarget(script.id),
        }),
    ];
}

function findImageWithoutIsolatedContainer(script: ScriptNode): ValidationIssue[] {
    const { image, runIn } = script.config;
    const namesImage = image !== undefined && image.trim() !== "";
    if (!namesImage || runIn === "isolated") {
        return [];
    }

    return [
        errorIssue({
            code: "script_image_without_isolated",
            message:
                `O Comando ${quote(script.label)} escolhe uma imagem, ` +
                "mas roda no container do item.",
            fix:
                "Mude Onde roda para Container isolado " +
                "ou apague a imagem em Avançado › Imagem.",
            fieldKey: "runIn",
            target: nodeTarget(script.id),
        }),
    ];
}

function findDuplicateEnvVars(script: ScriptNode): ValidationIssue[] {
    const names = script.config.env.map((envVar) => envVar.name);
    const repeatedNames = new Set(names.filter((name, index) => names.indexOf(name) !== index));

    return [...repeatedNames].map((name) =>
        errorIssue({
            code: "duplicate_env_var",
            message: `O Comando ${quote(script.label)} define a variável ${name} mais de uma vez.`,
            fix: `Apague as linhas repetidas de ${name} em Variáveis de ambiente.`,
            fieldKey: "env",
            target: nodeTarget(script.id),
        }),
    );
}
