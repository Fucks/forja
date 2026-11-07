export type StateMachineName = "Run" | "NodeRun";

export class InvalidTransitionError extends Error {
    constructor(
        readonly machine: StateMachineName,
        readonly from: string,
        readonly to: string,
    ) {
        super(`Transição inválida de ${machine}: ${from} → ${to}`);
        this.name = "InvalidTransitionError";
    }
}
