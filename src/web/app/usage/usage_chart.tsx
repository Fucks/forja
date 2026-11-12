import type { JSX } from "react";

import { formatCalendarDay, formatTokens, formatUsd } from "@/lib/format.js";
import type { UsageRow } from "@/web/app/usage/use_usage.js";
import { Tooltip } from "@/web/components/ui/tooltip.js";

interface DailyBar {
    day: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
}

const CHART_LABEL = "Tokens por dia";
const MAX_DAY_LABELS = 10;
const FULL_HEIGHT_PERCENT = 100;

export function UsageChart({ days, rows }: { days: string[]; rows: UsageRow[] }): JSX.Element {
    const bars = toDailyBars(days, rows);
    const maxTokens = Math.max(0, ...bars.map(totalTokensOf));
    const dayLabelStep = Math.ceil(days.length / MAX_DAY_LABELS);

    return (
        <figure className="flex flex-col gap-2">
            <figcaption className="flex items-center justify-between gap-4">
                <span className="font-medium">{CHART_LABEL}</span>
                <ChartLegend />
            </figcaption>
            <div className="flex gap-2">
                <TokensAxis maxTokens={maxTokens} />
                <ol aria-label={CHART_LABEL} className="flex flex-1 gap-0.5">
                    {bars.map((bar, index) => (
                        <DayBar
                            key={bar.day}
                            bar={bar}
                            maxTokens={maxTokens}
                            showsDayLabel={index % dayLabelStep === 0}
                        />
                    ))}
                </ol>
            </div>
        </figure>
    );
}

// Days without usage get an empty bar, so the gaps in the period stay visible.
function toDailyBars(days: string[], rows: UsageRow[]): DailyBar[] {
    const rowsByDay = new Map(rows.map((row) => [row.key, row]));

    return days.map((day) => {
        const row = rowsByDay.get(day);

        return {
            day,
            inputTokens: row?.inputTokens ?? 0,
            outputTokens: row?.outputTokens ?? 0,
            costUsd: row?.costUsd ?? 0,
        };
    });
}

function totalTokensOf(bar: DailyBar): number {
    return bar.inputTokens + bar.outputTokens;
}

function ChartLegend(): JSX.Element {
    return (
        <ul aria-label="Legenda" className="flex gap-3 text-xs text-muted">
            <li className="flex items-center gap-1">
                <span aria-hidden className="size-2.5 rounded-sm bg-steel" />
                Entrada
            </li>
            <li className="flex items-center gap-1">
                <span aria-hidden className="size-2.5 rounded-sm bg-accent" />
                Saída
            </li>
        </ul>
    );
}

function TokensAxis({ maxTokens }: { maxTokens: number }): JSX.Element {
    return (
        <div
            aria-hidden
            className="flex h-48 flex-col justify-between border-r border-muted pr-1 text-right font-mono text-xs text-muted"
        >
            <span>{formatTokens(maxTokens)}</span>
            <span>0</span>
        </div>
    );
}

function DayBar({
    bar,
    maxTokens,
    showsDayLabel,
}: {
    bar: DailyBar;
    maxTokens: number;
    showsDayLabel: boolean;
}): JSX.Element {
    const dayLabel = formatCalendarDay(bar.day);

    return (
        <li aria-label={describeBar(bar)} className="flex min-w-0 flex-1 flex-col gap-1">
            <Tooltip content={<BarDetails bar={bar} />}>
                <div
                    tabIndex={0}
                    className="flex h-48 flex-col justify-end gap-0.5 border-b border-muted focus-visible:outline-accent"
                >
                    <div
                        className="rounded-t-sm bg-accent"
                        style={{ height: heightPercentOf(bar.outputTokens, maxTokens) }}
                    />
                    <div
                        className="bg-steel"
                        style={{ height: heightPercentOf(bar.inputTokens, maxTokens) }}
                    />
                </div>
            </Tooltip>
            <span aria-hidden className="truncate text-center font-mono text-xs text-muted">
                {showsDayLabel ? dayLabel : ""}
            </span>
        </li>
    );
}

function BarDetails({ bar }: { bar: DailyBar }): JSX.Element {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="font-medium">{formatCalendarDay(bar.day)}</span>
            <span>Entrada: {formatTokens(bar.inputTokens)}</span>
            <span>Saída: {formatTokens(bar.outputTokens)}</span>
            <span>Custo: {formatUsd(bar.costUsd)}</span>
        </div>
    );
}

function describeBar(bar: DailyBar): string {
    const input = formatTokens(bar.inputTokens);
    const output = formatTokens(bar.outputTokens);

    return `${formatCalendarDay(bar.day)}: ${input} de entrada, ${output} de saída, ${formatUsd(bar.costUsd)}`;
}

function heightPercentOf(tokens: number, maxTokens: number): string {
    if (maxTokens === 0) {
        return "0%";
    }

    return `${(tokens / maxTokens) * FULL_HEIGHT_PERCENT}%`;
}
