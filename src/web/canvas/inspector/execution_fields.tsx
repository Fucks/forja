import { useId } from "react";
import type { JSX } from "react";

import {
    AGENT_WORKSPACES,
    MAX_AGENT_ITERATIONS,
    MAX_AGENT_RETRIES,
    MAX_AGENT_TURNS,
    MIN_AGENT_ITERATIONS,
    MIN_AGENT_RETRIES,
    MIN_AGENT_TIMEOUT_MINUTES,
    MIN_AGENT_TURNS,
    agentConfigSchema,
} from "@/shared/node_configs/agent_config.js";
import type { AgentConfig } from "@/shared/node_configs/agent_config.js";
import { IntegerField } from "@/web/canvas/inspector/integer_field.js";
import { Field } from "@/web/components/ui/field.js";
import { Select } from "@/web/components/ui/select.js";

type AgentWorkspace = AgentConfig["workspace"];

const WORKSPACE_LABELS: Record<AgentWorkspace, string> = {
    item: "Workspace do item",
    none: "Sem workspace",
};
const WORKSPACE_OPTIONS = AGENT_WORKSPACES.map((workspace) => ({
    value: workspace,
    label: WORKSPACE_LABELS[workspace],
}));
const AGENT_FIELDS = agentConfigSchema.shape;

export function ExecutionFields({
    config,
    onChange,
}: {
    config: AgentConfig;
    onChange: (changes: Partial<AgentConfig>) => void;
}): JSX.Element {
    const workspaceId = useId();

    return (
        <>
            <Field label="Workspace" htmlFor={workspaceId}>
                <Select
                    value={config.workspace}
                    options={WORKSPACE_OPTIONS}
                    onChange={(workspace) => onChange({ workspace })}
                />
            </Field>
            <IntegerField
                label="Iterações máximas"
                value={config.maxIterations}
                schema={AGENT_FIELDS.maxIterations}
                limits={{ min: MIN_AGENT_ITERATIONS, max: MAX_AGENT_ITERATIONS }}
                onChange={(maxIterations) => onChange({ maxIterations })}
            />
            <IntegerField
                label="Turnos máximos"
                value={config.maxTurns}
                schema={AGENT_FIELDS.maxTurns}
                limits={{ min: MIN_AGENT_TURNS, max: MAX_AGENT_TURNS }}
                onChange={(maxTurns) => onChange({ maxTurns })}
            />
            <IntegerField
                label="Timeout (min)"
                value={config.timeoutMinutes}
                schema={AGENT_FIELDS.timeoutMinutes}
                limits={{ min: MIN_AGENT_TIMEOUT_MINUTES }}
                onChange={(timeoutMinutes) => onChange({ timeoutMinutes })}
            />
            <IntegerField
                label="Timeout sem atividade (min)"
                value={config.idleTimeoutMinutes}
                schema={AGENT_FIELDS.idleTimeoutMinutes}
                limits={{ min: MIN_AGENT_TIMEOUT_MINUTES }}
                onChange={(idleTimeoutMinutes) => onChange({ idleTimeoutMinutes })}
            />
            <IntegerField
                label="Retentativas"
                value={config.retries}
                schema={AGENT_FIELDS.retries}
                limits={{ min: MIN_AGENT_RETRIES, max: MAX_AGENT_RETRIES }}
                onChange={(retries) => onChange({ retries })}
            />
        </>
    );
}
