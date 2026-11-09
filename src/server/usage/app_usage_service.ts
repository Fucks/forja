import type { Clock } from "@/lib/clock.js";
import { newId } from "@/lib/ids.js";
import type { ForjaDb } from "@/server/db/client.js";
import type { SettingsService } from "@/server/settings/settings_service.js";
import { UsageRepository } from "@/server/usage/usage_repository.js";
import { createUsageService, type UsageService } from "@/server/usage/usage_service.js";

export interface AppUsageServiceDeps {
    db: ForjaDb;
    settings: SettingsService;
    clock: Clock;
}

// The usage service of the app, priced by the global settings and dated in the project time zone.
export function createAppUsageService({ db, settings, clock }: AppUsageServiceDeps): UsageService {
    return createUsageService({
        repo: new UsageRepository(db),
        clock,
        newId,
        modelPrices: async () => (await settings.getGlobalSettings()).modelPrices,
        timezoneOf: async (projectId) => (await settings.getProjectSettings(projectId)).timezone,
    });
}
