import { eq } from "drizzle-orm";

import type { ForjaDb } from "@/server/db/client.js";
import { globalSettings, projectSettings } from "@/server/db/schema/settings.js";
import { globalSettingsSchema, projectSettingsSchema } from "@/shared/settings_types.js";
import type { GlobalSettings, ProjectSettings } from "@/shared/settings_types.js";

const GLOBAL_SETTINGS_ID = "global";

// Stored JSON is parsed with the schema again, so fields added after it was saved get their defaults.
export class SettingsRepository {
    constructor(private readonly db: ForjaDb) {}

    findProjectSettings(projectId: string): ProjectSettings | undefined {
        const row = this.db
            .select({ json: projectSettings.json })
            .from(projectSettings)
            .where(eq(projectSettings.projectId, projectId))
            .get();
        return row && projectSettingsSchema.parse(JSON.parse(row.json));
    }

    saveProjectSettings(projectId: string, settings: ProjectSettings, updatedAt: string): void {
        const row = { projectId, json: JSON.stringify(settings), updatedAt };
        this.db
            .insert(projectSettings)
            .values(row)
            .onConflictDoUpdate({ target: projectSettings.projectId, set: row })
            .run();
    }

    findGlobalSettings(): GlobalSettings | undefined {
        const row = this.db
            .select({ json: globalSettings.json })
            .from(globalSettings)
            .where(eq(globalSettings.id, GLOBAL_SETTINGS_ID))
            .get();
        return row && globalSettingsSchema.parse(JSON.parse(row.json));
    }

    saveGlobalSettings(settings: GlobalSettings, updatedAt: string): void {
        const row = { id: GLOBAL_SETTINGS_ID, json: JSON.stringify(settings), updatedAt };
        this.db
            .insert(globalSettings)
            .values(row)
            .onConflictDoUpdate({ target: globalSettings.id, set: row })
            .run();
    }
}
