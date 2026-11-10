import type { WorkItemSnapshot } from "@/shared/work_item_types.js";

const SECTION_SEPARATOR = "\n\n";
const FORJA_SIGNATURE = "🤖 Gerado pela Forja";

// Only GitHub issues have a number, and `Closes #N` closes the issue when the PR is merged.
export function buildPullRequestBody(item: WorkItemSnapshot, summary: string | undefined): string {
    const closingLine = item.number === undefined ? [] : [`Closes #${item.number}`];
    const sections = [summary ?? defaultSummaryOf(item), ...closingLine, FORJA_SIGNATURE];

    return sections.join(SECTION_SEPARATOR);
}

function defaultSummaryOf(item: WorkItemSnapshot): string {
    return `Alterações feitas pela Forja para "${item.title}".`;
}
