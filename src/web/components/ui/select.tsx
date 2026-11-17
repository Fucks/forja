import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { JSX } from "react";

import { cn } from "@/web/components/ui/cn.js";
import {
    CONTROL_HEIGHT_CLASSES,
    buildControlClassName,
} from "@/web/components/ui/control_styles.js";
import { useFieldControlAttributes } from "@/web/components/ui/field.js";
import { createOptionChangeHandler } from "@/web/components/ui/create_option_change_handler.js";

interface SelectOption<T extends string> {
    value: T;
    label: string;
    hint?: string;
}

const POPOVER_OFFSET_PX = 4;

export function Select<T extends string>({
    value,
    onChange,
    options,
    placeholder,
    invalid = false,
    label,
}: {
    value: T;
    onChange: (value: T) => void;
    options: SelectOption<T>[];
    placeholder?: string;
    invalid?: boolean;
    label?: string;
}): JSX.Element {
    const field = useFieldControlAttributes({ invalid });

    const changeToSelectedOption = createOptionChangeHandler(options, onChange);

    return (
        <RadixSelect.Root value={value} onValueChange={changeToSelectedOption}>
            <RadixSelect.Trigger
                {...field.attributes}
                aria-label={label}
                className={cn(
                    buildControlClassName({ isInvalid: field.isInvalid }),
                    CONTROL_HEIGHT_CLASSES.md,
                    "inline-flex items-center justify-between gap-2 data-placeholder:text-muted",
                )}
            >
                <RadixSelect.Value placeholder={placeholder} />
                <RadixSelect.Icon>
                    <ChevronDown aria-hidden className="size-3.5 text-muted" />
                </RadixSelect.Icon>
            </RadixSelect.Trigger>
            <RadixSelect.Portal>
                <RadixSelect.Content
                    position="popper"
                    sideOffset={POPOVER_OFFSET_PX}
                    className="z-50 min-w-(--radix-select-trigger-width) rounded-sm border border-border bg-surface-raised p-1 text-sm text-text shadow-float"
                >
                    <RadixSelect.Viewport>
                        {options.map((option) => (
                            <SelectItem key={option.value} option={option} />
                        ))}
                    </RadixSelect.Viewport>
                </RadixSelect.Content>
            </RadixSelect.Portal>
        </RadixSelect.Root>
    );
}

function SelectItem<T extends string>({ option }: { option: SelectOption<T> }): JSX.Element {
    return (
        <RadixSelect.Item
            value={option.value}
            className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none select-none data-highlighted:bg-surface"
        >
            <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
            {option.hint && <span className="text-xs text-muted">{option.hint}</span>}
            <RadixSelect.ItemIndicator className="ml-auto">
                <Check aria-hidden className="size-3.5 text-accent" />
            </RadixSelect.ItemIndicator>
        </RadixSelect.Item>
    );
}
