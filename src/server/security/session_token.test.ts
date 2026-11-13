import { createSessionToken, isSessionToken } from "@/server/security/session_token.js";

const TOKEN_BYTES = 32;

describe("createSessionToken", () => {
    it("makes a base64url token of 32 random bytes", () => {
        const token = createSessionToken();

        expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(Buffer.from(token, "base64url")).toHaveLength(TOKEN_BYTES);
    });

    it("makes a different token each time", () => {
        expect(createSessionToken()).not.toBe(createSessionToken());
    });
});

describe("isSessionToken", () => {
    it("accepts the session token", () => {
        const token = createSessionToken();

        expect(isSessionToken(token, token)).toBe(true);
    });

    it("rejects another token of the same length", () => {
        expect(isSessionToken(createSessionToken(), createSessionToken())).toBe(false);
    });

    it("rejects a prefix of the session token", () => {
        const token = createSessionToken();

        expect(isSessionToken(token.slice(0, 10), token)).toBe(false);
    });
});
