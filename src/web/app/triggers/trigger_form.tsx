import { useState } from "react";
import type { FormEvent, JSX, ReactNode } from "react";

import type { FlowSummary } from "@/shared/flow_types.js";
import { TRIGGER_POLICIES } from "@/shared/trigger_types.js";
import type { ListedTrigger, TriggerWithToken } from "@/shared/trigger_types.js";
import { useProjectFlows } from "@/web/app/flows/use_flow_summary.js";
import {
    buildCreateTriggerInput,
    buildTriggerChanges,
    createEmptyDraft,
    draftFromTrigger,
} from "@/web/app/triggers/trigger_draft.js";
import type { DraftChange, TriggerDraft } from "@/web/app/triggers/trigger_draft.js";
import { TriggerKindFields } from "@/web/app/triggers/trigger_kind_fields.js";
import { FixedFlowAndKind, FlowAndKindFields } from "@/web/app/triggers/trigger_identity_fields.js";
import { TRIGGER_POLICY_LABELS } from "@/web/app/triggers/trigger_labels.js";
import {
    hasWebhookToken,
    useCreateTrigger,
    useUpdateTrigger,
} from "@/web/app/triggers/use_triggers.js";
import { Button } from "@/web/components/ui/button.js";
import { Dialog } from "@/web/components/ui/dialog.js";
import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";
import { Select } from "@/web/components/ui/select.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";

export type TriggerEditor =
    { mode: "closed" } | { mode: "create" } | { mode: "edit"; trigger: ListedTrigger };

interface MutationState {
    isPending: boolean;
    error: Error | null;
}

const POLICY_OPTIONS = TRIGGER_POLICIES.map((policy) => ({
    value: policy,
    label: TRIGGER_POLICY_LABELS[policy],
}));
const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function TriggerFormDialog({
    projectId,
    editor,
    onClose,
    onWebhookCreated,
}: {
    projectId: string;
    editor: TriggerEditor;
    onClose: () => void;
    onWebhookCreated: (trigger: TriggerWithToken) => void;
}): JSX.Element {
    const editedTrigger = editor.mode === "edit" ? editor.trigger : undefined;

    return (
        <Dialog
            open={editor.mode !== "closed"}
            onOpenChange={onClose}
            title={editedTrigger ? "Editar gatilho" : "Novo gatilho"}
        >
            <FlowsLoader projectId={projectId}>
                {(flows) =>
                    editedTrigger ? (
                        <EditTriggerForm trigger={editedTrigger} flows={flows} onDone={onClose} />
                    ) : (
                        <CreateTriggerForm
                            projectId={projectId}
                            flows={flows}
                            onDone={onClose}
                            onWebhookCreated={onWebhookCreated}
                        />
                    )
                }
            </FlowsLoader>
        </Dialog>
    );
}

// The form starts on the default flow, so it waits for the flows instead of changing its draft later.
function FlowsLoader({
    projectId,
    children,
}: {
    projectId: string;
    children: (flows: FlowSummary[]) => JSX.Element;
}): JSX.Element {
    const flowsQuery = useProjectFlows(projectId);

    if (flowsQuery.isPending) {
        return <Skeleton className="h-40" />;
    }
    if (flowsQuery.isError) {
        return <p role="alert">{flowsQuery.error.message}</p>;
    }

    return children(flowsQuery.data.filter((flow) => !flow.archived));
}

function CreateTriggerForm({
    projectId,
    flows,
    onDone,
    onWebhookCreated,
}: {
    projectId: string;
    flows: FlowSummary[];
    onDone: () => void;
    onWebhookCreated: (trigger: TriggerWithToken) => void;
}): JSX.Element {
    const [draft, changeDraft] = useTriggerDraft(() =>
        createEmptyDraft(findDefaultFlowId(flows), BROWSER_TIMEZONE),
    );
    const createTrigger = useCreateTrigger(projectId);

    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        createTrigger.mutate(buildCreateTriggerInput(draft), {
            onSuccess: (trigger) => {
                onDone();
                if (hasWebhookToken(trigger)) {
                    onWebhookCreated(trigger);
                }
            },
        });
    };

    return (
        <TriggerForm
            draft={draft}
            onChange={changeDraft}
            flows={flows}
            identityFields={
                <FlowAndKindFields draft={draft} onChange={changeDraft} flows={flows} />
            }
            saving={createTrigger}
            onSubmit={submit}
            onCancel={onDone}
        />
    );
}

function EditTriggerForm({
    trigger,
    flows,
    onDone,
}: {
    trigger: ListedTrigger;
    flows: FlowSummary[];
    onDone: () => void;
}): JSX.Element {
    const [draft, changeDraft] = useTriggerDraft(() => draftFromTrigger(trigger, BROWSER_TIMEZONE));
    const updateTrigger = useUpdateTrigger();

    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        updateTrigger.mutate(
            { id: trigger.id, changes: buildTriggerChanges(draft) },
            { onSuccess: onDone },
        );
    };

    return (
        <TriggerForm
            draft={draft}
            onChange={changeDraft}
            flows={flows}
            identityFields={<FixedFlowAndKind draft={draft} flows={flows} />}
            saving={updateTrigger}
            onSubmit={submit}
            onCancel={onDone}
        />
    );
}

function TriggerForm({
    draft,
    onChange,
    flows,
    identityFields,
    saving,
    onSubmit,
    onCancel,
}: {
    draft: TriggerDraft;
    onChange: DraftChange;
    flows: FlowSummary[];
    identityFields: ReactNode;
    saving: MutationState;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onCancel: () => void;
}): JSX.Element {
    return (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <Field label="Nome" htmlFor="trigger-name">
                <Input
                    required
                    value={draft.name}
                    onChange={(event) => onChange({ name: event.target.value })}
                />
            </Field>
            {identityFields}
            <TriggerKindFields draft={draft} onChange={onChange} flows={flows} />
            <Field label="Se já houver uma run" htmlFor="trigger-policy">
                <Select
                    value={draft.policy}
                    onChange={(policy) => onChange({ policy })}
                    options={POLICY_OPTIONS}
                />
            </Field>
            <FormFooter saving={saving} onCancel={onCancel} />
        </form>
    );
}

function FormFooter({
    saving,
    onCancel,
}: {
    saving: MutationState;
    onCancel: () => void;
}): JSX.Element {
    return (
        <>
            {saving.error && (
                <p role="alert" className="text-xs text-status-failed">
                    {saving.error.message}
                </p>
            )}
            <footer className="flex justify-end gap-2">
                <Button onClick={onCancel}>Cancelar</Button>
                <Button type="submit" variant="primary" loading={saving.isPending}>
                    Salvar
                </Button>
            </footer>
        </>
    );
}

function useTriggerDraft(createInitialDraft: () => TriggerDraft): [TriggerDraft, DraftChange] {
    const [draft, setDraft] = useState(createInitialDraft);
    const changeDraft: DraftChange = (changes) =>
        setDraft((current) => ({ ...current, ...changes }));

    return [draft, changeDraft];
}

function findDefaultFlowId(flows: FlowSummary[]): string {
    const defaultFlow = flows.find((flow) => flow.isDefault) ?? flows[0];

    return defaultFlow?.id ?? "";
}
