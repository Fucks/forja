export const MASTER_KEY_BYTES = 32;

export class InvalidMasterKeyError extends Error {
    constructor(readonly keyBytes: number) {
        super("A chave mestra do cofre de segredos é inválida");
        this.name = "InvalidMasterKeyError";
    }
}

export function assertValidMasterKey(masterKey: Buffer): void {
    if (masterKey.length !== MASTER_KEY_BYTES) {
        throw new InvalidMasterKeyError(masterKey.length);
    }
}
