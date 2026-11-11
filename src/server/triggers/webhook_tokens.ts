import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;
const HASH_ENCODING = "hex";

export function generateWebhookToken(): { token: string; hash: string } {
    const token = randomBytes(TOKEN_BYTES).toString("base64url");

    return { token, hash: hashWebhookToken(token) };
}

export function verifyWebhookToken(token: string, hash: string): boolean {
    const expectedHash = Buffer.from(hash, HASH_ENCODING);
    const receivedHash = Buffer.from(hashWebhookToken(token), HASH_ENCODING);
    if (expectedHash.length !== receivedHash.length) {
        return false;
    }

    return timingSafeEqual(expectedHash, receivedHash);
}

function hashWebhookToken(token: string): string {
    return createHash("sha256").update(token).digest(HASH_ENCODING);
}
