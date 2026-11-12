import { useEffect, useState } from "react";
import type { JSX, ReactNode } from "react";

import type { RunPauseReason } from "@/engine/run_state.js";
import { systemClock } from "@/lib/clock.js";
import type { Clock } from "@/lib/clock.js";
import { formatDuration, formatTimeOfDay } from "@/lib/format.js";
import type { SerializedRunRecord, SerializedRunView } from "@/shared/run_types.js";
import { RunActions } from "@/web/canvas/live/run_actions.js";
import { StatusBadge } from "@/web/components/ui/status_badge.js";

const DURATION_TICK_MS = 1_000;

const PAUSE_REASON_LABELS: Record<RunPauseReason, string> = {
    user: "Pausada pelo usuário",
    usage_limit: "Pausada por limite de uso",
    budget: "Pausada por orçamento",
};

export function RunControlBar({
    view,
    clock = systemClock,
    children,
}: {
    view: SerializedRunView;
    clock?: Clock;
    /** Controls placed before the run actions, such as the item filter. */
    children?: ReactNode;
}): JSX.Element {
    const { run } = view;
    const pauseDescription = describePause(run);

    return (
        <section
            aria-label="Controle da run"
            className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-3 py-2 text-sm"
        >
            <StatusBadge status={run.status} />
            <span className="font-medium">
                {run.flowName} · v{run.flowVersion}
            </span>
            <RunDuration run={run} clock={clock} />
            {pauseDescription && (
                <span role="status" className="text-muted">
                    {pauseDescription}
                </span>
            )}
            <div className="ml-auto flex items-center gap-2">
                {children}
                <RunActions run={run} />
            </div>
        </section>
    );
}

function describePause(run: SerializedRunRecord): string | undefined {
    if (run.status !== "PAUSED" || run.pauseReason === undefined) {
        return undefined;
    }

    const reason = PAUSE_REASON_LABELS[run.pauseReason];
    if (run.resumeAt === undefined) {
        return reason;
    }

    return `${reason} — retoma às ${formatTimeOfDay(new Date(run.resumeAt))}`;
}

function RunDuration({ run, clock }: { run: SerializedRunRecord; clock: Clock }): JSX.Element {
    const isFinished = run.finishedAt !== undefined;
    const now = useNow(clock, { isTicking: !isFinished });
    if (run.startedAt === undefined) {
        return <span className="font-mono text-muted">—</span>;
    }

    const endedAt = run.finishedAt === undefined ? now : new Date(run.finishedAt);
    const durationMs = Math.max(0, endedAt.getTime() - new Date(run.startedAt).getTime());

    return (
        <time className="font-mono text-muted" aria-label="Duração">
            {formatDuration(durationMs)}
        </time>
    );
}

function useNow(clock: Clock, { isTicking }: { isTicking: boolean }): Date {
    const [now, setNow] = useState(() => clock.now());

    useEffect(() => {
        if (!isTicking) {
            return;
        }

        let cancelTick = clock.setTimeout(tick, DURATION_TICK_MS);
        function tick(): void {
            setNow(clock.now());
            cancelTick = clock.setTimeout(tick, DURATION_TICK_MS);
        }

        return () => cancelTick();
    }, [clock, isTicking]);

    return now;
}
