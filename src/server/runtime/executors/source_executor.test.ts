import { selectSourceItems } from "@/server/runtime/executors/select_source_items.js";
import { type SourceConfig, sourceConfigSchema } from "@/shared/node_configs/source_config.js";
import type { WorkItem } from "@/shared/work_item_types.js";
import { buildWorkItem } from "@/test/factories/work_item_factory.js";

const SANDCASTLE_LABEL = "Sandcastle";
const GITHUB_SOURCE = sourceConfigSchema.parse({ provider: "github", label: SANDCASTLE_LABEL });
const LOCAL_SOURCE = sourceConfigSchema.parse({ provider: "local" });

describe("selectSourceItems", () => {
    it("selects the open items with the label", () => {
        const issue = buildIssueItem(1);

        const selection = select([issue]);

        expect(selection).toEqual({ selected: [issue], excluded: [] });
    });

    it("excludes closed items", () => {
        const closed = buildIssueItem(1, { state: "closed" });

        const selection = select([closed]);

        expect(selection.excluded).toEqual([{ itemId: closed.id, reason: "closed" }]);
    });

    it("excludes items without the label of the source", () => {
        const unlabeled = buildIssueItem(1, { labels: [] });

        const selection = select([unlabeled]);

        expect(selection.excluded).toEqual([{ itemId: unlabeled.id, reason: "label" }]);
    });

    it("selects items with any label when the source has none", () => {
        const unlabeled = buildIssueItem(1, { labels: [] });

        const selection = select([unlabeled], { config: { ...GITHUB_SOURCE, label: undefined } });

        expect(selection.selected).toEqual([unlabeled]);
    });

    it("excludes items blocked by an open item", () => {
        const blocker = buildIssueItem(1);
        const blocked = buildIssueItem(2, { blockedBy: [blocker.id] });

        const selection = select([blocker, blocked]);

        expect(selection.selected).toEqual([blocker]);
        expect(selection.excluded).toEqual([{ itemId: blocked.id, reason: "blocked" }]);
    });

    it("selects items whose blockers are all closed", () => {
        const closedBlocker = buildIssueItem(1, { state: "closed" });
        const unblocked = buildIssueItem(2, { blockedBy: [closedBlocker.id] });

        const selection = select([closedBlocker, unblocked]);

        expect(selection.selected).toEqual([unblocked]);
    });

    it("selects blocked items when the source does not skip them", () => {
        const blocker = buildIssueItem(1);
        const blocked = buildIssueItem(2, { blockedBy: [blocker.id] });

        const selection = select([blocker, blocked], {
            config: { ...GITHUB_SOURCE, skipBlocked: false },
        });

        expect(selection.selected).toEqual([blocker, blocked]);
    });

    it("looks for the blockers among all the items of the project", () => {
        const blockerWithoutLabel = buildIssueItem(1, { labels: [] });
        const blocked = buildIssueItem(2, { blockedBy: [blockerWithoutLabel.id] });

        const selection = selectSourceItems({
            ...emptyContext(),
            candidates: [blocked],
            all: itemsById([blockerWithoutLabel, blocked]),
            config: GITHUB_SOURCE,
        });

        expect(selection.excluded).toEqual([{ itemId: blocked.id, reason: "blocked" }]);
    });

    it("excludes items being processed by another active run", () => {
        const inOtherRun = buildIssueItem(1);

        const selection = select([inOtherRun], { itemsInActiveRuns: new Set([inOtherRun.id]) });

        expect(selection.excluded).toEqual([{ itemId: inOtherRun.id, reason: "in_other_run" }]);
    });

    it("excludes items that already have an open pull request", () => {
        const withOpenPr = buildIssueItem(1);

        const selection = select([withOpenPr], { itemsWithOpenPr: new Set([withOpenPr.id]) });

        expect(selection.excluded).toEqual([{ itemId: withOpenPr.id, reason: "has_open_pr" }]);
    });

    it("gives each excluded item only the first reason that applies", () => {
        const closedInOtherRun = buildIssueItem(1, { state: "closed" });

        const selection = select([closedInOtherRun], {
            itemsInActiveRuns: new Set([closedInOtherRun.id]),
        });

        expect(selection.excluded).toEqual([{ itemId: closedInOtherRun.id, reason: "closed" }]);
    });

    it("delivers the issues with the lowest numbers up to the limit", () => {
        const issues = [5, 3, 1, 4, 2].map((number) => buildIssueItem(number));

        const selection = select(issues, { config: { ...GITHUB_SOURCE, limit: 3 } });

        expect(selection.selected.map((item) => item.number)).toEqual([1, 2, 3]);
        expect(selection.excluded).toEqual([
            { itemId: "itm_issue4", reason: "limit" },
            { itemId: "itm_issue5", reason: "limit" },
        ]);
    });

    it("orders local items by creation", () => {
        const newer = buildLocalItem("itm_newer", "2026-05-04T10:00:00.000Z");
        const older = buildLocalItem("itm_older", "2026-05-04T09:00:00.000Z");

        const selection = select([newer, older], { config: LOCAL_SOURCE });

        expect(selection.selected).toEqual([older, newer]);
    });

    it("starts from the requested items, whatever their labels", () => {
        const requested = buildIssueItem(1, { labels: [] });
        const notRequested = buildIssueItem(2);

        const selection = select([requested, notRequested], { requestedIds: [requested.id] });

        expect(selection).toEqual({ selected: [requested], excluded: [] });
    });

    it("still excludes the blocked items among the requested ones", () => {
        const blocker = buildIssueItem(1);
        const blocked = buildIssueItem(2, { blockedBy: [blocker.id] });

        const selection = select([blocker, blocked], { requestedIds: [blocked.id] });

        expect(selection).toEqual({
            selected: [],
            excluded: [{ itemId: blocked.id, reason: "blocked" }],
        });
    });
});

interface SelectionOverrides {
    config?: SourceConfig;
    requestedIds?: string[];
    itemsInActiveRuns?: Set<string>;
    itemsWithOpenPr?: Set<string>;
}

function select(candidates: WorkItem[], overrides: SelectionOverrides = {}) {
    return selectSourceItems({
        ...emptyContext(),
        candidates,
        all: itemsById(candidates),
        config: GITHUB_SOURCE,
        ...overrides,
    });
}

function emptyContext() {
    return { itemsInActiveRuns: new Set<string>(), itemsWithOpenPr: new Set<string>() };
}

function itemsById(items: WorkItem[]): Map<string, WorkItem> {
    return new Map(items.map((item) => [item.id, item]));
}

function buildIssueItem(number: number, overrides: Partial<WorkItem> = {}): WorkItem {
    return buildWorkItem({
        id: `itm_issue${number}`,
        number,
        title: `Issue ${number}`,
        url: `https://github.com/Fucks/forja/issues/${number}`,
        branch: `forja/issue-${number}`,
        labels: [SANDCASTLE_LABEL],
        ...overrides,
    });
}

function buildLocalItem(id: string, createdAt: string): WorkItem {
    return buildWorkItem({
        id,
        source: "local",
        number: undefined,
        url: undefined,
        createdAt,
    });
}
