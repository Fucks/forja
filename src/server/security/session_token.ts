import { randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;

export function createSessionToken(): string {
    return randomBytes(TOKEN_BYTES).toString("base64url");
}

// Constant time, so the response time does not tell how much of the token a guess got right.
export function isSessionToken(received: string, sessionToken: string): boolean {
    const receivedBytes = Buffer.from(received);
    const sessionTokenBytes = Buffer.from(sessionToken);
    if (receivedBytes.length !== sessionTokenBytes.length) {
        return false;
    }

    return timingSafeEqual(receivedBytes, sessionTokenBytes);
}
