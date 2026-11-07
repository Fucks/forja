import * as RadixToggleGroup from "@radix-ui/react-toggle-group";
import type { JSX } from "react";

import { cn } from "@/web/components/ui/cn.js";
import { CONTROL_HEIGHT_CLASSES, FOCUS_RING_CLASSES } from "@/web/components/ui/control_styles.js";
import { createOptionChangeHandler } from "@/web/components/ui/create_option_change_handler.js";

interface SegmentedControlOption<T extends string> {
    value: T;
    label: string;
}

export function SegmentedControl<T extends string>({
    value,
    onChange,
    options,
    label,
}: {
    value: T;
    onChange: (value: T) => void;
    options: SegmentedControlOption<T>[];
    label: string;
}): JSX.Element {
    const changeToSelectedOption = createOptionChangeHandler(options, onChange);

    return (
        <RadixToggleGroup.Root
            type="single"
            value={value}
            onValueChange={changeToSelectedOption}
            aria-label={label}
            className={cn(
                "inline-flex gap-0.5 rounded-sm border border-border bg-surface p-0.5",
                CONTROL_HEIGHT_CLASSES.md,
            )}
        >
            {options.map((option) => (
                <RadixToggleGroup.Item
                    key={option.value}
                    value={option.value}
                    className={cn(
                        "rounded-sm px-2.5 text-sm text-muted transition-colors hover:text-text data-[state=on]:bg-surface-raised data-[state=on]:text-text",
                        FOCUS_RING_CLASSES,
                    )}
                >
                    {option.label}
                </RadixToggleGroup.Item>
            ))}
        </RadixToggleGroup.Root>
    );
}
