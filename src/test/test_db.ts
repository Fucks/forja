import { openDatabase } from "@/server/db/client.js";
import type { DatabaseHandle } from "@/server/db/client.js";

const IN_MEMORY_DATABASE = ":memory:";

export function createTestDb(): DatabaseHandle {
    return openDatabase(IN_MEMORY_DATABASE);
}
