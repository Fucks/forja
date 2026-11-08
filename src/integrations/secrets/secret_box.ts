import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { assertValidMasterKey } from "@/integrations/secrets/master_key.js";

export interface SecretBox {
    seal(plaintext: string): string;
    open(sealed: string): string;
}

export class InvalidSecretError extends Error {
    constructor() {
        super("O segredo foi adulterado ou cifrado com outra chave");
        this.name = "InvalidSecretError";
    }
}

const CIPHER_ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const SEALED_VERSION = "v1";
const SEALED_SEPARATOR = ":";
const SEALED_ENCODING = "base64";
const PLAINTEXT_ENCODING = "utf8";

interface SealedParts {
    iv: Buffer;
    authTag: Buffer;
    ciphertext: Buffer;
}

export function createSecretBox(masterKey: Buffer): SecretBox {
    assertValidMasterKey(masterKey);

    return {
        seal: (plaintext) => formatSealed(encrypt(masterKey, plaintext)),
        open: (sealed) => decrypt(masterKey, parseSealed(sealed)),
    };
}

function encrypt(masterKey: Buffer, plaintext: string): SealedParts {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(CIPHER_ALGORITHM, masterKey, iv);
    const ciphertext = Buffer.concat([
        cipher.update(plaintext, PLAINTEXT_ENCODING),
        cipher.final(),
    ]);

    return { iv, authTag: cipher.getAuthTag(), ciphertext };
}

function formatSealed({ iv, authTag, ciphertext }: SealedParts): string {
    const encodedParts = [iv, authTag, ciphertext].map((part) => part.toString(SEALED_ENCODING));
    return [SEALED_VERSION, ...encodedParts].join(SEALED_SEPARATOR);
}

function parseSealed(sealed: string): SealedParts {
    const [version, iv, authTag, ciphertext, ...extraParts] = sealed.split(SEALED_SEPARATOR);
    const hasAllParts = iv !== undefined && authTag !== undefined && ciphertext !== undefined;
    if (version !== SEALED_VERSION || !hasAllParts || extraParts.length > 0) {
        throw new InvalidSecretError();
    }

    return {
        iv: Buffer.from(iv, SEALED_ENCODING),
        authTag: Buffer.from(authTag, SEALED_ENCODING),
        ciphertext: Buffer.from(ciphertext, SEALED_ENCODING),
    };
}

function decrypt(masterKey: Buffer, { iv, authTag, ciphertext }: SealedParts): string {
    try {
        const decipher = createDecipheriv(CIPHER_ALGORITHM, masterKey, iv);
        decipher.setAuthTag(authTag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return plaintext.toString(PLAINTEXT_ENCODING);
    } catch {
        // Node reports tampering, a wrong key and malformed IV/tag with different errors;
        // callers only need to know the secret can't be trusted.
        throw new InvalidSecretError();
    }
}
