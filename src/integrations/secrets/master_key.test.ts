import type { PathLike, PathOrFileDescriptor } from "node:fs";

import {
    InvalidMasterKeyError,
    loadOrCreateMasterKey,
    MASTER_KEY_BYTES,
    type MasterKeyFs,
} from "@/integrations/secrets/master_key.js";

const MASTER_KEY_PATH = "/home/forja/.forja/master.key";
const OWNER_ONLY_PERMISSIONS = 0o600;

class InMemoryFs {
    readonly files = new Map<string, Buffer>();
    readonly permissions = new Map<string, number>();
    chmodError: Error | undefined;

    existsSync(path: PathLike): boolean {
        return this.files.has(String(path));
    }

    readFileSync(path: PathOrFileDescriptor): Buffer {
        const contents = this.files.get(String(path));
        if (!contents) {
            throw new Error(`ENOENT: ${String(path)}`);
        }
        return Buffer.from(contents);
    }

    writeFileSync(path: PathOrFileDescriptor, contents: Buffer): void {
        this.files.set(String(path), Buffer.from(contents));
    }

    chmodSync(path: PathLike, mode: number): void {
        if (this.chmodError) {
            throw this.chmodError;
        }
        this.permissions.set(String(path), mode);
    }

    asNodeFs(): MasterKeyFs {
        // node:fs overloads (string results for encodings) can't be satisfied by a Buffer-only fake.
        return this as unknown as MasterKeyFs;
    }
}

function stubPlatform(platform: NodeJS.Platform): void {
    vi.spyOn(process, "platform", "get").mockReturnValue(platform);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("loadOrCreateMasterKey", () => {
    it("creates a random 32-byte key when the file does not exist", () => {
        const fs = new InMemoryFs();

        const masterKey = loadOrCreateMasterKey(MASTER_KEY_PATH, fs.asNodeFs());

        expect(masterKey).toHaveLength(MASTER_KEY_BYTES);
        expect(fs.files.get(MASTER_KEY_PATH)).toEqual(masterKey);
    });

    it("restricts the new key file to its owner", () => {
        const fs = new InMemoryFs();

        loadOrCreateMasterKey(MASTER_KEY_PATH, fs.asNodeFs());

        expect(fs.permissions.get(MASTER_KEY_PATH)).toBe(OWNER_ONLY_PERMISSIONS);
    });

    it("reuses the key created before", () => {
        const fs = new InMemoryFs();

        const created = loadOrCreateMasterKey(MASTER_KEY_PATH, fs.asNodeFs());
        const loaded = loadOrCreateMasterKey(MASTER_KEY_PATH, fs.asNodeFs());

        expect(loaded).toEqual(created);
    });

    it("creates different keys for different files", () => {
        const fs = new InMemoryFs();

        const first = loadOrCreateMasterKey(MASTER_KEY_PATH, fs.asNodeFs());
        const second = loadOrCreateMasterKey(`${MASTER_KEY_PATH}.other`, fs.asNodeFs());

        expect(first).not.toEqual(second);
    });

    it("rejects an existing key file that does not hold 32 bytes", () => {
        const fs = new InMemoryFs();
        fs.files.set(MASTER_KEY_PATH, Buffer.from("too short"));

        expect(() => loadOrCreateMasterKey(MASTER_KEY_PATH, fs.asNodeFs())).toThrow(
            InvalidMasterKeyError,
        );
    });

    it("ignores a chmod failure on Windows", () => {
        stubPlatform("win32");
        const fs = new InMemoryFs();
        fs.chmodError = new Error("EPERM");

        const masterKey = loadOrCreateMasterKey(MASTER_KEY_PATH, fs.asNodeFs());

        expect(fs.files.get(MASTER_KEY_PATH)).toEqual(masterKey);
    });

    it("reports a chmod failure on other platforms", () => {
        stubPlatform("linux");
        const fs = new InMemoryFs();
        fs.chmodError = new Error("EPERM");

        expect(() => loadOrCreateMasterKey(MASTER_KEY_PATH, fs.asNodeFs())).toThrow("EPERM");
    });
});
