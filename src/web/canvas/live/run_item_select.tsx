import type { JSX } from "react";

import { describeItem } from "@/web/canvas/live/run_view_model.js";
import { Field } from "@/web/components/ui/field.js";
import { Select } from "@/web/components/ui/select.js";

const ITEM_SELECT_ID = "run-item-filter";
// Radix Select refuses an empty value, so "every item" needs a value of its own.
const EVERY_ITEM = "*";

export function RunItemSelect({
    itemIds,
    filterItemId,
    onFilterChange,
}: {
    itemIds: string[];
    filterItemId: string | undefined;
    onFilterChange: (filterItemId: string | undefined) => void;
}): JSX.Element {
    const options = [
        { value: EVERY_ITEM, label: "Todos" },
        ...itemIds.map((itemId) => ({ value: itemId, label: describeItem(itemId) })),
    ];

    return (
        <Field label="Item" htmlFor={ITEM_SELECT_ID}>
            <Select
                value={filterItemId ?? EVERY_ITEM}
                options={options}
                onChange={(value) => onFilterChange(value === EVERY_ITEM ? undefined : value)}
            />
        </Field>
    );
}
