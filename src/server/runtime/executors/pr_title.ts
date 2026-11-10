import type { WorkItemSnapshot } from "@/shared/work_item_types.js";

// Local items have no number to show.
export function prTitle(item: WorkItemSnapshot): string {
    if (item.number === undefined) {
        return item.title;
    }

    return `${item.title} (#${item.number})`;
}
