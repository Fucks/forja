import * as RadixSwitch from "@radix-ui/react-switch";
import { useId } from "react";
import type { JSX } from "react";

import { cn } from "@/web/components/ui/cn.js";
import { DISABLED_CLASSES, FOCUS_RING_CLASSES } from "@/web/components/ui/control_styles.js";

export function Switch({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
}): JSX.Element {
    const switchId = useId();

    return (
        <div className="inline-flex items-center gap-2">
            <RadixSwitch.Root
                id={switchId}
                checked={checked}
                onCheckedChange={onChange}
                className={cn(
                    "inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-border transition-colors data-[state=checked]:bg-accent",
                    FOCUS_RING_CLASSES,
                    DISABLED_CLASSES,
                )}
            >
                <RadixSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-text transition-transform data-[state=checked]:translate-x-4.5" />
            </RadixSwitch.Root>
            <label htmlFor={switchId} className="text-sm text-text">
                {label}
            </label>
        </div>
    );
}
