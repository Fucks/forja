// Runs the work of the same key one after the other; work of different keys runs freely.
export class SerialQueueByKey {
    private readonly tails = new Map<string, Promise<void>>();

    enqueue<Result>(key: string, work: () => Promise<Result>): Promise<Result> {
        const previous = this.tails.get(key) ?? Promise.resolve();
        const running = previous.then(work);
        // The caller gets the failure; the next work of the key must still run.
        const tail = running.then(
            () => undefined,
            () => undefined,
        );
        this.tails.set(key, tail);
        void tail.then(() => this.forgetIfIdle(key, tail));

        return running;
    }

    private forgetIfIdle(key: string, tail: Promise<void>): void {
        if (this.tails.get(key) === tail) {
            this.tails.delete(key);
        }
    }
}
