import type { JSX } from "react";

import { describeCron } from "@/engine/cron_schedule.js";
import { assertNever } from "@/lib/assert_never.js";
import type { FlowSummary } from "@/shared/flow_types.js";
import { ITEM_SELECTIONS, TRIGGER_EVENTS } from "@/shared/trigger_types.js";
import {
    CRON_PRESETS,
    CUSTOM_CRON_PRESET,
    findCronPresetValue,
} from "@/web/app/triggers/cron_presets.js";
import { ANY_FILTER, FINISHED_RUN_STATUSES } from "@/web/app/triggers/trigger_draft.js";
import type {
    DraftChange,
    RunStatusFilter,
    TriggerDraft,
} from "@/web/app/triggers/trigger_draft.js";
import { ITEM_SELECTION_LABELS, TRIGGER_EVENT_LABELS } from "@/web/app/triggers/trigger_labels.js";
import { useFlowBoardColumns } from "@/web/app/triggers/use_triggers.js";
import { EXECUTION_STATUS_STYLES } from "@/web/components/ui/execution_status.js";
import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";
import { Select } from "@/web/components/ui/select.js";

interface KindFieldsProps {
    draft: TriggerDraft;
    onChange: DraftChange;
    flows: FlowSummary[];
}

const EVENT_OPTIONS = TRIGGER_EVENTS.map((event) => ({
    value: event,
    label: TRIGGER_EVENT_LABELS[event],
}));
const ITEM_SELECTION_OPTIONS = ITEM_SELECTIONS.map((itemSelection) => ({
    value: itemSelection,
    label: ITEM_SELECTION_LABELS[itemSelection],
}));
const RUN_STATUS_OPTIONS: { value: RunStatusFilter; label: string }[] = [
    { value: ANY_FILTER, label: "Qualquer estado" },
    ...FINISHED_RUN_STATUSES.map((status) => ({
        value: status,
        label: EXECUTION_STATUS_STYLES[status].label,
    })),
];
const UNPUBLISHED_FLOW_HINT = "Publique o fluxo para escolher uma das colunas do board.";

export function TriggerKindFields(props: KindFieldsProps): JSX.Element | null {
    switch (props.draft.kind) {
        case "manual":
            return null;
        case "schedule":
            return <ScheduleFields {...props} />;
        case "event":
            return <EventFields {...props} />;
        case "webhook":
            return <ItemSelectionField {...props} />;
        case "board_column":
            return <BoardColumnField {...props} />;
        default:
            return assertNever(props.draft.kind);
    }
}

// Choosing "Personalizado" clears the expression, so the field is ready for the user's own.
function ScheduleFields({ draft, onChange }: KindFieldsProps): JSX.Element {
    const choosePreset = (preset: string): void => {
        onChange({ cron: preset === CUSTOM_CRON_PRESET ? "" : preset });
    };

    return (
        <>
            <Field label="Quando" htmlFor="trigger-cron-preset">
                <Select
                    value={findCronPresetValue(draft.cron)}
                    onChange={choosePreset}
                    options={CRON_PRESETS}
                />
            </Field>
            <Field label="Expressão cron" htmlFor="trigger-cron" hint={describeCron(draft.cron)}>
                <Input
                    required
                    mono
                    value={draft.cron}
                    onChange={(event) => onChange({ cron: event.target.value })}
                />
            </Field>
            <Field label="Fuso horário" htmlFor="trigger-timezone">
                <Input
                    required
                    value={draft.timezone}
                    onChange={(event) => onChange({ timezone: event.target.value })}
                />
            </Field>
        </>
    );
}

function EventFields(props: KindFieldsProps): JSX.Element {
    const { draft, onChange } = props;

    return (
        <>
            <Field label="Evento" htmlFor="trigger-event">
                <Select
                    value={draft.event}
                    onChange={(event) => onChange({ event })}
                    options={EVENT_OPTIONS}
                />
            </Field>
            {draft.event === "run.finished" && <FinishedRunFilterFields {...props} />}
            <ItemSelectionField {...props} />
        </>
    );
}

function FinishedRunFilterFields({ draft, onChange, flows }: KindFieldsProps): JSX.Element {
    const flowOptions = [
        { value: ANY_FILTER, label: "Qualquer fluxo" },
        ...flows.map((flow) => ({ value: flow.id, label: flow.name })),
    ];

    return (
        <>
            <Field label="Fluxo da run" htmlFor="trigger-run-flow">
                <Select
                    value={draft.runFlowId}
                    onChange={(runFlowId) => onChange({ runFlowId })}
                    options={flowOptions}
                />
            </Field>
            <Field label="Estado da run" htmlFor="trigger-run-status">
                <Select
                    value={draft.runStatus}
                    onChange={(runStatus) => onChange({ runStatus })}
                    options={RUN_STATUS_OPTIONS}
                />
            </Field>
        </>
    );
}

function ItemSelectionField({ draft, onChange }: KindFieldsProps): JSX.Element {
    return (
        <Field label="Itens da run" htmlFor="trigger-item-selection">
            <Select
                value={draft.itemSelection}
                onChange={(itemSelection) => onChange({ itemSelection })}
                options={ITEM_SELECTION_OPTIONS}
            />
        </Field>
    );
}

function BoardColumnField({ draft, onChange, flows }: KindFieldsProps): JSX.Element {
    const flow = flows.find((candidate) => candidate.id === draft.flowId);
    const columnsQuery = useFlowBoardColumns(flow);
    const columnOptions = (columnsQuery.data ?? []).map((column) => ({
        value: column.id,
        label: column.label,
    }));
    const hint = flow?.latestVersion === undefined ? UNPUBLISHED_FLOW_HINT : undefined;

    return (
        <Field label="Coluna" htmlFor="trigger-column" hint={hint}>
            <Select
                value={draft.columnId}
                onChange={(columnId) => onChange({ columnId })}
                options={columnOptions}
                placeholder="Escolha a coluna"
            />
        </Field>
    );
}
