// Running the computation inside the executor turns a thrown error into a rejected promise instead of a
// synchronous throw, so services over synchronous repositories keep a uniform async contract.
export function resolveWith<T>(compute: () => T): Promise<T> {
    return new Promise((resolve) => resolve(compute()));
}
