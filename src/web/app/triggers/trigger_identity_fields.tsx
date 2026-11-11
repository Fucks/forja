import type { JSX } from "react";

import type { FlowSummary } from "@/shared/flow_types.js";
import { TRIGGER_KINDS } from "@/shared/trigger_types.js";
import type { TriggerKind } from "@/shared/trigger_types.js";
import { findFlowName } from "@/web/app/triggers/find_flow_name.js";
import type { DraftChange, TriggerDraft } from "@/web/app/triggers/trigger_draft.js";
import { TRIGGER_KIND_STYLES } from "@/web/app/triggers/trigger_labels.js";
import { Field } from "@/web/components/ui/field.js";
import { Select } from "@/web/components/ui/select.js";

const KIND_OPTIONS = TRIGGER_KINDS.map((kind) => ({
    value: kind,
    label: TRIGGER_KIND_STYLES[kind].label,
}));

export function FlowAndKindFields({
    draft,
    onChange,
    flows,
}: {
    draft: TriggerDraft;
    onChange: DraftChange;
    flows: FlowSummary[];
}): JSX.Element {
    return (
        <>
            <Field label="Fluxo" htmlFor="trigger-flow">
                <Select
                    value={draft.flowId}
                    onChange={(flowId) => onChange({ flowId, columnId: "" })}
                    options={flows.map((flow) => ({ value: flow.id, label: flow.name }))}
                    placeholder="Escolha o fluxo"
                />
            </Field>
            <Field label="Tipo" htmlFor="trigger-kind">
                <Select
                    value={draft.kind}
                    onChange={(kind: TriggerKind) => onChange({ kind })}
                    options={KIND_OPTIONS}
                />
            </Field>
        </>
    );
}

// The flow and the type are fixed once created: a webhook needs a new token and a trigger never
// moves to another flow.
export function FixedFlowAndKind({
    draft,
    flows,
}: {
    draft: TriggerDraft;
    flows: FlowSummary[];
}): JSX.Element {
    return (
        <p className="text-muted">
            {findFlowName(flows, draft.flowId)} · {TRIGGER_KIND_STYLES[draft.kind].label}
        </p>
    );
}
