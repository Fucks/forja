import { errorIssue, nodeTarget } from "@/engine/validation_rules/validation_issues.js";
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
        errorIssue(
            "empty_command",
            `O nó "${script.label}" não tem comando.`,
            nodeTarget(script.id),
        ),
    ];
}

function findImageWithoutIsolatedContainer(script: ScriptNode): ValidationIssue[] {
    const { image, runIn } = script.config;
    const namesImage = image !== undefined && image.trim() !== "";
    if (!namesImage || runIn === "isolated") {
        return [];
    }

    return [
        errorIssue(
            "script_image_without_isolated",
            `O nó "${script.label}" só pode escolher a imagem quando roda num container isolado.`,
            nodeTarget(script.id),
        ),
    ];
}

function findDuplicateEnvVars(script: ScriptNode): ValidationIssue[] {
    const names = script.config.env.map((envVar) => envVar.name);
    const repeatedNames = new Set(names.filter((name, index) => names.indexOf(name) !== index));

    return [...repeatedNames].map((name) =>
        errorIssue(
            "duplicate_env_var",
            `O nó "${script.label}" define a variável ${name} mais de uma vez.`,
            nodeTarget(script.id),
        ),
    );
}
