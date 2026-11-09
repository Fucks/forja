import type Database from "better-sqlite3";

import { localDayOf } from "@/lib/local_day.js";

export const LOCAL_DAY_FUNCTION = "local_day";

// SQLite has no time zones, so grouping by the day of a project needs local_day(at, timeZone).
export function registerSqlFunctions(sqlite: Database.Database): void {
    sqlite.function(LOCAL_DAY_FUNCTION, { deterministic: true }, (at: string, timeZone: string) =>
        localDayOf(new Date(at), timeZone),
    );
}
