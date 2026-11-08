import { randomBytes } from "node:crypto";
import type * as nodeFs from "node:fs";

export const MASTER_KEY_BYTES = 32;

const OWNER_ONLY_PERMISSIONS = 0o600;
const WINDOWS_PLATFORM = "win32";

export type MasterKeyFs = Pick<
    typeof nodeFs,
    "existsSync" | "readFileSync" | "writeFileSync" | "chmodSync"
>;

export class InvalidMasterKeyError extends Error {
    constructor(readonly keyBytes: number) {
        super("A chave mestra do cofre de segredos é inválida");
        this.name = "InvalidMasterKeyError";
    }
}

export function loadOrCreateMasterKey(path: string, fs: MasterKeyFs): Buffer {
    if (fs.existsSync(path)) {
        return loadMasterKey(path, fs);
    }

    return createMasterKey(path, fs);
}

export function assertValidMasterKey(masterKey: Buffer): void {
    if (masterKey.length !== MASTER_KEY_BYTES) {
        throw new InvalidMasterKeyError(masterKey.length);
    }
}

function loadMasterKey(path: string, fs: MasterKeyFs): Buffer {
    const masterKey = fs.readFileSync(path);
    assertValidMasterKey(masterKey);

    return masterKey;
}

function createMasterKey(path: string, fs: MasterKeyFs): Buffer {
    const masterKey = randomBytes(MASTER_KEY_BYTES);
    fs.writeFileSync(path, masterKey, { mode: OWNER_ONLY_PERMISSIONS });
    restrictToOwner(path, fs);

    return masterKey;
}

function restrictToOwner(path: string, fs: MasterKeyFs): void {
    try {
        fs.chmodSync(path, OWNER_ONLY_PERMISSIONS);
    } catch (error) {
        // Windows has no POSIX permissions; the user profile ACL already protects the file.
        if (process.platform !== WINDOWS_PLATFORM) {
            throw error;
        }
    }
}
