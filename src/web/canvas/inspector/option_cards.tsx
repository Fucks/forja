import { Check } from "lucide-react";
import { useRef } from "react";
import type { JSX, KeyboardEvent } from "react";

import { cn } from "@/web/components/ui/cn.js";
import { FOCUS_RING_CLASSES } from "@/web/components/ui/control_styles.js";

export interface OptionCard<T extends string> {
    value: T;
    label: string;
    description: string;
}

type ArrowDirection = 1 | -1;

const ARROW_DIRECTIONS: Partial<Record<string, ArrowDirection>> = {
    ArrowDown: 1,
    ArrowRight: 1,
    ArrowUp: -1,
    ArrowLeft: -1,
};

// Follows the WAI-ARIA radio group: only the selected card is a Tab stop, the arrows select.
export function OptionCards<T extends string>({
    value,
    options,
    onChange,
    label,
}: {
    value: T;
    options: OptionCard<T>[];
    onChange: (value: T) => void;
    label: string;
}): JSX.Element {
    const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const tabStopValue = findTabStopValue(options, value);

    function selectWithArrows(event: KeyboardEvent, index: number): void {
        const direction = ARROW_DIRECTIONS[event.key];
        if (direction === undefined) {
            return;
        }

        event.preventDefault();
        const nextIndex = (index + direction + options.length) % options.length;
        const nextOption = options[nextIndex];
        if (nextOption) {
            onChange(nextOption.value);
            cardRefs.current[nextIndex]?.focus();
        }
    }

    return (
        <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
            {options.map((option, index) => (
                <OptionCardButton
                    key={option.value}
                    ref={(card) => {
                        cardRefs.current[index] = card;
                    }}
                    option={option}
                    isSelected={option.value === value}
                    isTabStop={option.value === tabStopValue}
                    onSelect={() => onChange(option.value)}
                    onKeyDown={(event) => selectWithArrows(event, index)}
                />
            ))}
        </div>
    );
}

// With no card selected, the first one is the Tab stop so the group can still be reached.
function findTabStopValue<T extends string>(options: OptionCard<T>[], value: T): T | undefined {
    const hasSelectedOption = options.some((option) => option.value === value);

    return hasSelectedOption ? value : options[0]?.value;
}

function OptionCardButton<T extends string>({
    ref,
    option,
    isSelected,
    isTabStop,
    onSelect,
    onKeyDown,
}: {
    ref: (card: HTMLButtonElement | null) => void;
    option: OptionCard<T>;
    isSelected: boolean;
    isTabStop: boolean;
    onSelect: () => void;
    onKeyDown: (event: KeyboardEvent) => void;
}): JSX.Element {
    return (
        <button
            ref={ref}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isTabStop ? 0 : -1}
            onClick={onSelect}
            onKeyDown={onKeyDown}
            className={cn(
                "flex items-start gap-2 rounded-sm border bg-surface p-2.5 text-left",
                isSelected ? "border-accent" : "border-border hover:border-muted",
                FOCUS_RING_CLASSES,
            )}
        >
            <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium text-text">{option.label}</span>
                <span className="text-xs text-muted">{option.description}</span>
            </span>
            {isSelected && <Check aria-hidden className="size-4 shrink-0 text-accent" />}
        </button>
    );
}
