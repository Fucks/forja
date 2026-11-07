import type { DatabaseHandle } from "@/server/db/client.js";
import { appMeta } from "@/server/db/schema/meta.js";
import { createTestDb } from "@/test/test_db.js";

describe("createTestDb", () => {
    let openHandles: DatabaseHandle[];

    beforeEach(() => {
        openHandles = [];
    });

    afterEach(() => {
        for (const handle of openHandles) {
            handle.close();
        }
    });

    function openTestDb(): DatabaseHandle {
        const handle = createTestDb();
        openHandles.push(handle);
        return handle;
    }

    it("opens an in-memory database with every migration applied", () => {
        const { db, sqlite } = openTestDb();

        db.insert(appMeta).values({ key: "schema", value: "ready" }).run();

        expect(db.select().from(appMeta).all()).toEqual([{ key: "schema", value: "ready" }]);
        expect(sqlite.memory).toBe(true);
    });

    it("gives each call its own empty database", () => {
        const first = openTestDb();
        const second = openTestDb();

        first.db.insert(appMeta).values({ key: "owner", value: "first" }).run();

        expect(second.db.select().from(appMeta).all()).toEqual([]);
    });
});
