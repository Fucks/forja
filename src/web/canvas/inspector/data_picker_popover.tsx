import { useId, useState } from "react";
import type { JSX, KeyboardEvent } from "react";

import type { PickableDataField } from "@/web/canvas/inspector/data_picker.js";
import {
    filterFieldsBySearch,
    groupFieldsBySource,
} from "@/web/canvas/inspector/data_picker_groups.js";
import { DataFieldTree } from "@/web/canvas/inspector/data_field_tree.js";
import { Input } from "@/web/components/ui/input.js";

interface DataPickerPopoverProps {
    fields: PickableDataField[];
    onPick: (path: string) => void;
    onTypePath: () => void;
    onClose: () => void;
}

export function DataPickerPopover({
    fields,
    onPick,
    onTypePath,
    onClose,
}: DataPickerPopoverProps): JSX.Element {
    const rowIdPrefix = useId();
    const [search, setSearch] = useState("");
    const [collapsedTitles, setCollapsedTitles] = useState<ReadonlySet<string>>(new Set());
    const [activeIndex, setActiveIndex] = useState(0);

    const groups = groupFieldsBySource(filterFieldsBySearch(fields, search));
    const visibleFields = groups.flatMap((group) =>
        collapsedTitles.has(group.title) ? [] : group.fields,
    );
    const activeField = visibleFields[activeIndex];
    const rowIdOf = (field: PickableDataField): string => `${rowIdPrefix}-${field.path}`;

    function moveActiveRow(step: number): void {
        const lastIndex = visibleFields.length - 1;
        setActiveIndex((index) => Math.min(Math.max(index + step, 0), lastIndex));
    }

    function toggleGroup(title: string): void {
        const nextTitles = new Set(collapsedTitles);
        if (!nextTitles.delete(title)) {
            nextTitles.add(title);
        }
        setCollapsedTitles(nextTitles);
        setActiveIndex(0);
    }

    function pickActiveField(): void {
        if (activeField) {
            onPick(activeField.path);
        }
    }

    function navigateWithKeyboard(event: KeyboardEvent): void {
        const actions: Record<string, () => void> = {
            ArrowDown: () => moveActiveRow(1),
            ArrowUp: () => moveActiveRow(-1),
            Enter: pickActiveField,
            Escape: onClose,
        };
        const action = actions[event.key];
        if (!action) {
            return;
        }

        // The keys belong to the picker: Esc must not also close the inspector around it.
        event.preventDefault();
        event.stopPropagation();
        action();
    }

    return (
        <div
            onKeyDown={navigateWithKeyboard}
            className="absolute top-full left-0 z-20 mt-1 flex max-h-96 w-80 flex-col gap-2 rounded-sm border border-border bg-surface-raised p-2 shadow-float"
        >
            <Input
                type="search"
                aria-label="Buscar dado"
                placeholder="Buscar dado"
                value={search}
                autoFocus
                aria-activedescendant={activeField && rowIdOf(activeField)}
                onChange={(event) => {
                    setSearch(event.target.value);
                    setActiveIndex(0);
                }}
            />
            <div className="min-h-0 overflow-y-auto">
                <DataFieldTree
                    groups={groups}
                    hasFields={fields.length > 0}
                    collapsedTitles={collapsedTitles}
                    activePath={activeField?.path}
                    rowIdOf={rowIdOf}
                    onToggleGroup={toggleGroup}
                    onPick={onPick}
                />
            </div>
            <button
                type="button"
                onClick={onTypePath}
                className="self-start text-xs text-muted underline hover:text-text"
            >
                Digitar caminho
            </button>
        </div>
    );
}
