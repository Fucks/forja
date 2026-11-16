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
import { fieldDoc, fieldOptionCards } from "@/web/canvas/inspector/field_doc.js";
import { IntegerField } from "@/web/canvas/inspector/integer_field.js";
import { OptionCardsField } from "@/web/canvas/inspector/option_cards_field.js";

interface AgentConfigFieldsProps {
    config: AgentConfig;
    onChange: (changes: Partial<AgentConfig>) => void;
}

const AGENT_FIELDS = agentConfigSchema.shape;
const WORKSPACE_DOC = fieldDoc("agent", "workspace");
const WORKSPACE_CARDS = fieldOptionCards(WORKSPACE_DOC, AGENT_WORKSPACES);

export function ExecutionFields({ config, onChange }: AgentConfigFieldsProps): JSX.Element {
    return (
        <>
            <OptionCardsField
                doc={WORKSPACE_DOC}
                value={config.workspace}
                options={WORKSPACE_CARDS}
                onChange={(workspace) => onChange({ workspace })}
            />
            <IntegerField
                doc={fieldDoc("agent", "maxIterations")}
                value={config.maxIterations}
                schema={AGENT_FIELDS.maxIterations}
                limits={{ min: MIN_AGENT_ITERATIONS, max: MAX_AGENT_ITERATIONS }}
                onChange={(maxIterations) => onChange({ maxIterations })}
            />
        </>
    );
}

export function ExecutionLimitFields({ config, onChange }: AgentConfigFieldsProps): JSX.Element {
    return (
        <>
            <IntegerField
                doc={fieldDoc("agent", "maxTurns")}
                value={config.maxTurns}
                schema={AGENT_FIELDS.maxTurns}
                limits={{ min: MIN_AGENT_TURNS, max: MAX_AGENT_TURNS }}
                onChange={(maxTurns) => onChange({ maxTurns })}
            />
            <IntegerField
                doc={fieldDoc("agent", "retries")}
                value={config.retries}
                schema={AGENT_FIELDS.retries}
                limits={{ min: MIN_AGENT_RETRIES, max: MAX_AGENT_RETRIES }}
                onChange={(retries) => onChange({ retries })}
            />
            <IntegerField
                doc={fieldDoc("agent", "timeoutMinutes")}
                value={config.timeoutMinutes}
                schema={AGENT_FIELDS.timeoutMinutes}
                limits={{ min: MIN_AGENT_TIMEOUT_MINUTES }}
                onChange={(timeoutMinutes) => onChange({ timeoutMinutes })}
            />
            <IntegerField
                doc={fieldDoc("agent", "idleTimeoutMinutes")}
                value={config.idleTimeoutMinutes}
                schema={AGENT_FIELDS.idleTimeoutMinutes}
                limits={{ min: MIN_AGENT_TIMEOUT_MINUTES }}
                onChange={(idleTimeoutMinutes) => onChange({ idleTimeoutMinutes })}
            />
        </>
    );
}
