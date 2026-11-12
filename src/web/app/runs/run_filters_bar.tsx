import type { JSX } from "react";

import { RUN_TERMINAL } from "@/engine/run_state.js";
import { RUN_STATUS_NAMES } from "@/shared/events.js";
import type { RunStatusName } from "@/shared/events.js";
import { useProjectFlows } from "@/web/app/flows/use_flow_summary.js";
import type { RunFilters } from "@/web/app/runs/use_runs.js";
import { EXECUTION_STATUS_STYLES } from "@/web/components/ui/execution_status.js";
import { Field } from "@/web/components/ui/field.js";
import { Select } from "@/web/components/ui/select.js";

const STATUS_FILTER_IDS = ["all", "active", "SUCCEEDED", "FAILED", "CANCELED"] as const;

type StatusFilterId = (typeof STATUS_FILTER_IDS)[number];

export interface RunFilterChoice {
    flowId: string;
    statusFilterId: StatusFilterId;
}

interface StatusFilter {
    label: string;
    statuses?: RunStatusName[];
}

// The select needs a value for "no filter", and no flow id looks like this one.
const ALL_FLOWS = "all";
const ACTIVE_RUN_STATUSES = RUN_STATUS_NAMES.filter((status) => !RUN_TERMINAL.has(status));

const STATUS_FILTERS: Record<StatusFilterId, StatusFilter> = {
    all: { label: "Todos os estados" },
    active: { label: "Ativas", statuses: ACTIVE_RUN_STATUSES },
    SUCCEEDED: { label: EXECUTION_STATUS_STYLES.SUCCEEDED.label, statuses: ["SUCCEEDED"] },
    FAILED: { label: EXECUTION_STATUS_STYLES.FAILED.label, statuses: ["FAILED"] },
    CANCELED: { label: EXECUTION_STATUS_STYLES.CANCELED.label, statuses: ["CANCELED"] },
};

const STATUS_FILTER_OPTIONS = STATUS_FILTER_IDS.map((id) => ({
    value: id,
    label: STATUS_FILTERS[id].label,
}));

export const ALL_RUNS_CHOICE: RunFilterChoice = { flowId: ALL_FLOWS, statusFilterId: "all" };

export function RunFiltersBar({
    projectId,
    choice,
    onChange,
}: {
    projectId: string;
    choice: RunFilterChoice;
    onChange: (choice: RunFilterChoice) => void;
}): JSX.Element {
    const flows = useProjectFlows(projectId).data ?? [];
    const flowOptions = [
        { value: ALL_FLOWS, label: "Todos os fluxos" },
        ...flows.map((flow) => ({ value: flow.id, label: flow.name })),
    ];

    return (
        <div className="flex flex-wrap gap-3">
            <Field label="Fluxo" htmlFor="runs-flow-filter">
                <Select
                    value={choice.flowId}
                    onChange={(flowId) => onChange({ ...choice, flowId })}
                    options={flowOptions}
                />
            </Field>
            <Field label="Estado" htmlFor="runs-status-filter">
                <Select
                    value={choice.statusFilterId}
                    onChange={(statusFilterId) => onChange({ ...choice, statusFilterId })}
                    options={STATUS_FILTER_OPTIONS}
                />
            </Field>
        </div>
    );
}

export function toRunFilters(choice: RunFilterChoice): RunFilters {
    return {
        flowId: choice.flowId === ALL_FLOWS ? undefined : choice.flowId,
        status: STATUS_FILTERS[choice.statusFilterId].statuses,
    };
}
