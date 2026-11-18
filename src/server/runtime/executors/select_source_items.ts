import { isBlockedByOpenItem } from "@/server/work_items/work_item_service.js";
import type { SourceConfig } from "@/shared/node_configs/source_config.js";
import type { WorkItem } from "@/shared/work_item_types.js";

export type ExclusionReason =
    "blocked" | "closed" | "label" | "has_open_pr" | "limit" | "in_other_run";

export interface ExcludedItem {
    itemId: string;
    reason: ExclusionReason;
}

/** The fields of a work item that the selection reads. */
export type SourceCandidate = Pick<
    WorkItem,
    "id" | "number" | "labels" | "state" | "blockedBy" | "createdAt"
>;

export interface SourceSelection<Item extends SourceCandidate = WorkItem> {
    selected: Item[];
    excluded: ExcludedItem[];
}

export interface SourceSelectionInput<Item extends SourceCandidate = WorkItem> {
    candidates: Item[];
    all: Map<string, SourceCandidate>;
    config: SourceConfig;
    requestedIds?: string[];
    itemsInActiveRuns: Set<string>;
    itemsWithOpenPr: Set<string>;
}

type CandidateCheck = { eligible: true } | { eligible: false; reason: ExclusionReason };

const ELIGIBLE: CandidateCheck = { eligible: true };

export function selectSourceItems<Item extends SourceCandidate>(
    input: SourceSelectionInput<Item>,
): SourceSelection<Item> {
    const eligible: Item[] = [];
    const excluded: ExcludedItem[] = [];
    for (const item of startingItems(input)) {
        const check = checkCandidate(item, input);
        if (check.eligible) {
            eligible.push(item);
        } else {
            excluded.push({ itemId: item.id, reason: check.reason });
        }
    }

    return cutAtLimit(eligible.sort(compareSourceOrder), excluded, input.config.limit);
}

function startingItems<Item extends SourceCandidate>({
    candidates,
    requestedIds,
}: SourceSelectionInput<Item>): Item[] {
    if (requestedIds === undefined) {
        return candidates;
    }

    return candidates.filter((item) => requestedIds.includes(item.id));
}

// The order of the checks decides which reason an item excluded for several reasons shows.
function checkCandidate(
    item: SourceCandidate,
    input: SourceSelectionInput<SourceCandidate>,
): CandidateCheck {
    if (item.state === "closed") {
        return { eligible: false, reason: "closed" };
    }
    if (input.requestedIds === undefined && !hasSourceLabel(item, input.config)) {
        return { eligible: false, reason: "label" };
    }
    if (input.config.skipBlocked && isBlockedByOpenItem(item, input.all)) {
        return { eligible: false, reason: "blocked" };
    }
    if (input.itemsInActiveRuns.has(item.id)) {
        return { eligible: false, reason: "in_other_run" };
    }
    if (input.itemsWithOpenPr.has(item.id)) {
        return { eligible: false, reason: "has_open_pr" };
    }

    return ELIGIBLE;
}

function hasSourceLabel(item: SourceCandidate, config: SourceConfig): boolean {
    return config.label === undefined || item.labels.includes(config.label);
}

// Issues follow their number; local items, which have none, follow their creation.
function compareSourceOrder(a: SourceCandidate, b: SourceCandidate): number {
    if (a.number !== undefined && b.number !== undefined) {
        return a.number - b.number;
    }

    return a.createdAt.localeCompare(b.createdAt);
}

function cutAtLimit<Item extends SourceCandidate>(
    eligibleInOrder: Item[],
    excluded: ExcludedItem[],
    limit: number,
): SourceSelection<Item> {
    const beyondLimit = eligibleInOrder
        .slice(limit)
        .map((item): ExcludedItem => ({ itemId: item.id, reason: "limit" }));

    return {
        selected: eligibleInOrder.slice(0, limit),
        excluded: [...excluded, ...beyondLimit],
    };
}
