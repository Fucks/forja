import * as RadixSlider from "@radix-ui/react-slider";
import { useId } from "react";
import type { JSX, ReactNode } from "react";

import { cn } from "@/web/components/ui/cn.js";
import { FOCUS_RING_CLASSES } from "@/web/components/ui/control_styles.js";

const DEFAULT_STEP = 1;

export function Slider({
    value,
    min,
    max,
    step = DEFAULT_STEP,
    onChange,
    label,
    labelAddon,
}: {
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (value: number) => void;
    label: string;
    labelAddon?: ReactNode;
}): JSX.Element {
    const labelId = useId();

    function changeToSingleValue(values: number[]): void {
        const [selectedValue] = values;
        if (selectedValue !== undefined) {
            onChange(selectedValue);
        }
    }

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1">
                    <span id={labelId} className="text-text">
                        {label}
                    </span>
                    {labelAddon}
                </span>
                <span className="font-mono text-muted">{value}</span>
            </div>
            <RadixSlider.Root
                value={[value]}
                min={min}
                max={max}
                step={step}
                onValueChange={changeToSingleValue}
                className="relative flex h-5 touch-none items-center select-none"
            >
                <RadixSlider.Track className="relative h-1 grow rounded-full bg-border">
                    <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
                </RadixSlider.Track>
                <RadixSlider.Thumb
                    aria-labelledby={labelId}
                    className={cn("block size-3.5 rounded-full bg-accent", FOCUS_RING_CLASSES)}
                />
            </RadixSlider.Root>
        </div>
    );
}
