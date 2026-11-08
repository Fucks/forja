import { randomBytes } from "node:crypto";

import { InvalidMasterKeyError } from "@/integrations/secrets/master_key.js";
import { createSecretBox, InvalidSecretError } from "@/integrations/secrets/secret_box.js";

const MASTER_KEY_BYTES = 32;
const API_KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz-a1b2";

function createBoxWithRandomKey(): ReturnType<typeof createSecretBox> {
    return createSecretBox(randomBytes(MASTER_KEY_BYTES));
}

function tamperWithCiphertext(sealed: string): string {
    const [version, iv, tag, ciphertext] = sealed.split(":");
    const ciphertextBytes = Buffer.from(ciphertext ?? "", "base64");
    ciphertextBytes[0] = (ciphertextBytes[0] ?? 0) ^ 1;

    return [version, iv, tag, ciphertextBytes.toString("base64")].join(":");
}

describe("createSecretBox", () => {
    it("opens what it sealed", () => {
        const box = createBoxWithRandomKey();

        const opened = box.open(box.seal(API_KEY));

        expect(opened).toBe(API_KEY);
    });

    it("seals in the v1:<iv>:<tag>:<ciphertext> format without exposing the plaintext", () => {
        const box = createBoxWithRandomKey();

        const sealed = box.seal(API_KEY);

        expect(sealed).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
        expect(sealed).not.toContain(API_KEY);
    });

    it("produces a different result each time the same text is sealed", () => {
        const box = createBoxWithRandomKey();

        const first = box.seal(API_KEY);
        const second = box.seal(API_KEY);

        expect(first).not.toBe(second);
    });

    it("opens an empty secret", () => {
        const box = createBoxWithRandomKey();

        expect(box.open(box.seal(""))).toBe("");
    });

    it("rejects a sealed text whose ciphertext was tampered with", () => {
        const box = createBoxWithRandomKey();
        const tampered = tamperWithCiphertext(box.seal(API_KEY));

        expect(() => box.open(tampered)).toThrow(InvalidSecretError);
    });

    it("rejects a sealed text opened with a different key", () => {
        const sealed = createBoxWithRandomKey().seal(API_KEY);

        expect(() => createBoxWithRandomKey().open(sealed)).toThrow(InvalidSecretError);
    });

    it.each(["", "plain text", "v2:aaaa:bbbb:cccc", "v1:aaaa:bbbb", "v1:aaaa:bbbb:cccc:dddd"])(
        "rejects the malformed sealed text %j",
        (malformed) => {
            const box = createBoxWithRandomKey();

            expect(() => box.open(malformed)).toThrow(InvalidSecretError);
        },
    );

    it.each([0, 16, 31, 33])("rejects a master key with %i bytes", (keyBytes) => {
        expect(() => createSecretBox(randomBytes(keyBytes))).toThrow(InvalidMasterKeyError);
    });
});
