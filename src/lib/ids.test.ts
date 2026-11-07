import { newId } from "@/lib/ids.js";

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const IDS_TO_GENERATE = 1_000;

describe("newId", () => {
    it("starts with the prefix followed by an underscore", () => {
        const id = newId("run");

        expect(id.startsWith("run_")).toBe(true);
    });

    it("uses a ULID after the prefix", () => {
        const id = newId("cred");

        expect(id.slice("cred_".length)).toMatch(ULID_PATTERN);
    });

    it("generates ids that sort lexically in creation order", () => {
        const ids = Array.from({ length: IDS_TO_GENERATE }, () => newId("nrn"));

        const sortedIds = [...ids].sort();

        expect(sortedIds).toEqual(ids);
    });

    it("never repeats an id", () => {
        const ids = Array.from({ length: IDS_TO_GENERATE }, () => newId("itm"));

        expect(new Set(ids).size).toBe(IDS_TO_GENERATE);
    });
});
