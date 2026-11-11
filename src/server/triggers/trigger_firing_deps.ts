import { systemClock } from "@/lib/clock.js";
import type { AppDeps } from "@/server/app.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import type { TriggerFiringDeps } from "@/server/triggers/trigger_firing.js";
import { TriggerRepository } from "@/server/triggers/trigger_repository.js";

export function createTriggerFiringDeps(deps: AppDeps): TriggerFiringDeps {
    return {
        repo: new TriggerRepository(deps.db),
        executor: deps.executor,
        runs: new SqliteRunRepository(deps.db, systemClock),
        events: deps.events,
        clock: systemClock,
    };
}
