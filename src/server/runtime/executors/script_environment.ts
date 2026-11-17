import { formatVariableValue, parsePromptTemplate } from "@/engine/prompt_template.js";
import { resolveWith } from "@/lib/resolve_with.js";
import type { NodeExecutionContext } from "@/server/runtime/node_executors.js";
import { buildDataContext } from "@/server/runtime/run_context.js";
import { lookUpPath } from "@/shared/conditions.js";
import type { DataContext } from "@/shared/data_context.js";
import type { ScriptConfig, ScriptEnvVar } from "@/shared/node_configs/script_config.js";
import type { WorkItemSnapshot } from "@/shared/work_item_types.js";

export class CommandRenderError extends Error {
    constructor(readonly variable: string) {
        super(`Variável sem valor no comando: {{${variable}}}`);
        this.name = "CommandRenderError";
    }
}

type Environment = Record<string, string>;

const RUN_ID_VARIABLE = "FORJA_RUN_ID";
const INPUT_VARIABLE_PREFIX = "FORJA_INPUT_";
const SINGLE_QUOTE = "'";
// Closes the quoted string, writes an escaped quote and opens a new quoted string.
const ESCAPED_SINGLE_QUOTE = "'\\''";

/** The FORJA_* variables of the run, then the user's own, which may replace all but the run id. */
export function buildScriptEnvironment(
    context: NodeExecutionContext,
    config: ScriptConfig,
): Promise<Environment> {
    return resolveWith(() => ({
        ...forjaVariablesOf(context),
        ...userVariablesOf(context, config.env),
        [RUN_ID_VARIABLE]: context.run.id,
    }));
}

/** Replaces each {{path}} with its value, quoted so that the shell reads it as one literal word. */
export function renderCommand(command: string, data: DataContext): string {
    return renderTemplate(command, data, (value) => quoteForShell(formatVariableValue(value)));
}

function forjaVariablesOf(context: NodeExecutionContext): Environment {
    return {
        [RUN_ID_VARIABLE]: context.run.id,
        FORJA_PROJECT_BASE_BRANCH: context.project.baseBranch,
        FORJA_ITERATION: String(context.nodeRun.iteration),
        ...itemVariablesOf(context.item),
        ...inputVariablesOf(context.inputs),
    };
}

function itemVariablesOf(item: WorkItemSnapshot | undefined): Environment {
    if (!item) {
        return {};
    }

    return {
        FORJA_ITEM_ID: item.id,
        FORJA_ITEM_TITLE: item.title,
        FORJA_ITEM_BRANCH: item.branch,
        ...optionalVariable("FORJA_ITEM_NUMBER", item.number),
        ...optionalVariable("FORJA_ITEM_URL", item.url),
    };
}

function optionalVariable(name: string, value: string | number | undefined): Environment {
    if (value === undefined) {
        return {};
    }

    return { [name]: String(value) };
}

function inputVariablesOf(inputs: Record<string, unknown>): Environment {
    const entries = Object.entries(inputs).flatMap(([portName, value]) => {
        const json = JSON.stringify(value);
        if (json === undefined) {
            return [];
        }

        return [[INPUT_VARIABLE_PREFIX + portName.toUpperCase(), json] as const];
    });

    return Object.fromEntries(entries);
}

function userVariablesOf(context: NodeExecutionContext, envVars: ScriptEnvVar[]): Environment {
    const data = buildDataContext(context);
    const entries = envVars.map(
        (envVar) => [envVar.name, userVariableValue(context, envVar, data)] as const,
    );

    return Object.fromEntries(entries);
}

// The schema allows exactly one of value and credentialId.
function userVariableValue(
    context: NodeExecutionContext,
    envVar: ScriptEnvVar,
    data: DataContext,
): string {
    if (envVar.credentialId !== undefined) {
        return context.credentials.credentialValueOf(envVar.credentialId);
    }

    return renderTemplate(envVar.value ?? "", data, formatVariableValue);
}

function renderTemplate(
    template: string,
    data: DataContext,
    formatValue: (value: unknown) => string,
): string {
    const renderedTokens = parsePromptTemplate(template).map((token) => {
        if (token.kind === "text") {
            return token.value;
        }

        return formatValue(resolveCommandVariable(token.value, data));
    });

    return renderedTokens.join("");
}

function resolveCommandVariable(variable: string, data: DataContext): unknown {
    const lookup = lookUpPath(data, variable);
    if (!lookup.isFound || lookup.value === undefined) {
        throw new CommandRenderError(variable);
    }

    return lookup.value;
}

function quoteForShell(text: string): string {
    return SINGLE_QUOTE + text.replaceAll(SINGLE_QUOTE, ESCAPED_SINGLE_QUOTE) + SINGLE_QUOTE;
}
