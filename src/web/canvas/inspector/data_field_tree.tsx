import {
    Asterisk,
    Braces,
    ChevronDown,
    ChevronRight,
    Hash,
    List,
    ToggleLeft,
    Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

import type { DataType } from "@/engine/available_data.js";
import type { PickableDataField } from "@/web/canvas/inspector/data_picker.js";
import {
    describeFieldType,
    labelWithinSource,
    truncateSample,
} from "@/web/canvas/inspector/data_picker_groups.js";
import type { DataFieldGroup } from "@/web/canvas/inspector/data_picker_groups.js";
import { cn } from "@/web/components/ui/cn.js";

type FieldGroup = DataFieldGroup<PickableDataField>;

interface DataFieldTreeProps {
    groups: FieldGroup[];
    hasFields: boolean;
    collapsedTitles: ReadonlySet<string>;
    activePath: string | undefined;
    rowIdOf: (field: PickableDataField) => string;
    onToggleGroup: (title: string) => void;
    onPick: (path: string) => void;
}

const NO_DATA_MESSAGE =
    "Nenhum dado disponível: ligue este nó a outro ou coloque-o dentro de um Map";
const NO_MATCH_MESSAGE = "Nenhum dado encontrado.";
const ROW_INDENT_REM = 1;
const DATA_TYPE_ICONS: Record<DataType, LucideIcon> = {
    boolean: ToggleLeft,
    number: Hash,
    string: Type,
    list: List,
    object: Braces,
    any: Asterisk,
};

export function DataFieldTree({
    groups,
    hasFields,
    ...groupProps
}: DataFieldTreeProps): JSX.Element {
    if (groups.length === 0) {
        return (
            <p className="text-xs text-muted">{hasFields ? NO_MATCH_MESSAGE : NO_DATA_MESSAGE}</p>
        );
    }

    return (
        <ul role="tree" aria-label="Dados disponíveis" className="flex flex-col gap-1">
            {groups.map((group) => (
                <FieldGroupItem key={group.title} group={group} {...groupProps} />
            ))}
        </ul>
    );
}

function FieldGroupItem({
    group,
    collapsedTitles,
    activePath,
    rowIdOf,
    onToggleGroup,
    onPick,
}: Omit<DataFieldTreeProps, "groups" | "hasFields"> & { group: FieldGroup }): JSX.Element {
    const isExpanded = !collapsedTitles.has(group.title);
    const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

    return (
        <li role="treeitem" aria-label={group.title} aria-expanded={isExpanded}>
            <button
                type="button"
                onClick={() => onToggleGroup(group.title)}
                className="flex w-full items-center gap-1 text-xs font-medium text-muted"
            >
                <ChevronIcon aria-hidden className="size-3.5" />
                {group.title}
            </button>
            {isExpanded && (
                <ul role="group">
                    {group.fields.map((field) => (
                        <FieldRow
                            key={field.path}
                            id={rowIdOf(field)}
                            field={field}
                            isActive={field.path === activePath}
                            onPick={onPick}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}

function FieldRow({
    id,
    field,
    isActive,
    onPick,
}: {
    id: string;
    field: PickableDataField;
    isActive: boolean;
    onPick: (path: string) => void;
}): JSX.Element {
    const TypeIcon = DATA_TYPE_ICONS[field.type];
    const typeName = describeFieldType(field);

    return (
        <li
            id={id}
            role="treeitem"
            aria-label={`${field.label} (${typeName})`}
            aria-selected={isActive}
            title={field.description}
            onClick={() => onPick(field.path)}
            style={{ paddingLeft: `${field.depth * ROW_INDENT_REM}rem` }}
            className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-sm px-1 py-0.5 text-sm hover:bg-surface",
                isActive && "bg-surface",
            )}
        >
            <TypeIcon aria-hidden className="size-3.5 shrink-0 text-muted" />
            <span className="truncate">{labelWithinSource(field)}</span>
            <span className="shrink-0 text-xs text-muted">{typeName}</span>
            {field.sampleText !== undefined && (
                <span className="ml-auto truncate font-mono text-xs text-muted">
                    {truncateSample(field.sampleText)}
                </span>
            )}
        </li>
    );
}
