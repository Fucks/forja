import type { CommandRunner } from "@/integrations/process/command_runner.js";
import type { Clock } from "@/lib/clock.js";
import type { DiagnosticCheck } from "@/server/diagnostics/diagnostic_checks.js";
import type { DiagnosticReport } from "@/shared/diagnostic_types.js";

export interface DiagnosticServiceDeps {
    /** Read on every check, so items that depend on the projects follow their changes. */
    listChecks: () => DiagnosticCheck[];
    commands: CommandRunner;
    clock: Clock;
    cacheMs?: number;
}

export interface DiagnosticService {
    run(force?: boolean): Promise<DiagnosticReport>;
}

const DEFAULT_CACHE_MS = 30_000;

export function createDiagnosticService({
    listChecks,
    commands,
    clock,
    cacheMs = DEFAULT_CACHE_MS,
}: DiagnosticServiceDeps): DiagnosticService {
    let lastReport: DiagnosticReport | undefined;

    function isFresh(report: DiagnosticReport): boolean {
        const ageMs = clock.now().getTime() - Date.parse(report.checkedAt);
        return ageMs < cacheMs;
    }

    async function runChecks(): Promise<DiagnosticReport> {
        const nodeVersion = process.versions.node;
        const items = await Promise.all(
            listChecks().map((check) => check({ commands, nodeVersion })),
        );
        return { checkedAt: clock.now().toISOString(), items };
    }

    return {
        async run(force = false) {
            if (!force && lastReport && isFresh(lastReport)) {
                return lastReport;
            }

            lastReport = await runChecks();
            return lastReport;
        },
    };
}
