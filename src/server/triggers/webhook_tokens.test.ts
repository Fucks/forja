import { generateWebhookToken, verifyWebhookToken } from "@/server/triggers/webhook_tokens.js";

const TOKEN_BYTES = 32;
const SHA256_HEX_LENGTH = 64;

describe("generateWebhookToken", () => {
    it("makes a base64url token of 32 random bytes", () => {
        const { token } = generateWebhookToken();

        expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(Buffer.from(token, "base64url")).toHaveLength(TOKEN_BYTES);
    });

    it("keeps only the sha256 of the token", () => {
        const { token, hash } = generateWebhookToken();

        expect(hash).toHaveLength(SHA256_HEX_LENGTH);
        expect(hash).not.toContain(token);
    });

    it("makes a different token each time", () => {
        const first = generateWebhookToken();
        const second = generateWebhookToken();

        expect(first.token).not.toBe(second.token);
    });
});

describe("verifyWebhookToken", () => {
    it("accepts the token of the hash", () => {
        const { token, hash } = generateWebhookToken();

        expect(verifyWebhookToken(token, hash)).toBe(true);
    });

    it("rejects another token", () => {
        const { hash } = generateWebhookToken();
        const other = generateWebhookToken();

        expect(verifyWebhookToken(other.token, hash)).toBe(false);
    });

    it("rejects an empty token", () => {
        const { hash } = generateWebhookToken();

        expect(verifyWebhookToken("", hash)).toBe(false);
    });

    it("rejects a hash that is not a sha256", () => {
        const { token } = generateWebhookToken();

        expect(verifyWebhookToken(token, "abc")).toBe(false);
    });
});
