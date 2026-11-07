import { IN_MEMORY_DATABASE, openDatabase } from "@/server/db/client.js";
import type { DatabaseHandle } from "@/server/db/client.js";

export function createTestDb(): DatabaseHandle {
    return openDatabase(IN_MEMORY_DATABASE);
}
