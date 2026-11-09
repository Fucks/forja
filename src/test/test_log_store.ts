import {
    createSecretRedactor,
    type SecretRedactor,
} from "@/integrations/secrets/secret_redactor.js";
import type { Clock } from "@/lib/clock.js";
import type { ForjaDb } from "@/server/db/client.js";
import { createLogStore, type LogStore } from "@/server/runtime/log_store.js";
import { InMemoryFs } from "@/test/fakes/in_memory_fs.js";

// Never written to: the files live in memory.
const TEST_LOGS_DIR = "/srv/forja/logs";

export function createTestLogStore(
    db: ForjaDb,
    clock: Clock,
    redactor: SecretRedactor = createSecretRedactor(),
): LogStore {
    return createLogStore({ logsDir: TEST_LOGS_DIR, db, redactor, clock, fs: new InMemoryFs() });
}
