import { eq } from "drizzle-orm";

import type { ForjaDb } from "@/server/db/client.js";
import { appMeta } from "@/server/db/schema/meta.js";

const DEMO_SEEDED_KEY = "demo_seeded";
const DEMO_PROJECT_ID_KEY = "demo_project_id";
const SEEDED_VALUE = "true";

/** Remembers in `app_meta` which project the demo seed created. */
export class DemoMarker {
    constructor(private readonly db: ForjaDb) {}

    findSeededProjectId(): string | undefined {
        if (this.read(DEMO_SEEDED_KEY) !== SEEDED_VALUE) {
            return undefined;
        }

        return this.read(DEMO_PROJECT_ID_KEY);
    }

    markSeeded(projectId: string): void {
        this.db.transaction((transaction) => {
            write(transaction, DEMO_SEEDED_KEY, SEEDED_VALUE);
            write(transaction, DEMO_PROJECT_ID_KEY, projectId);
        });
    }

    private read(key: string): string | undefined {
        const row = this.db
            .select({ value: appMeta.value })
            .from(appMeta)
            .where(eq(appMeta.key, key))
            .get();

        return row?.value;
    }
}

function write(db: Pick<ForjaDb, "insert">, key: string, value: string): void {
    db.insert(appMeta)
        .values({ key, value })
        .onConflictDoUpdate({ target: appMeta.key, set: { value } })
        .run();
}
