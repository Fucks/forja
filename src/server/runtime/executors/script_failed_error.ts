/** An exit code other than 0 of a script whose `onFailure` is "fail". */
export class ScriptFailedError extends Error {
    constructor(readonly exitCode: number) {
        super(`O comando terminou com código ${exitCode}`);
        this.name = "ScriptFailedError";
    }
}
