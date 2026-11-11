// Objects keep their keys in insertion order, and that is the order JSON and YAML show them in.
export function withKeysInOrder<T extends object>(value: T, keyOrder: readonly (keyof T)[]): T {
    const orderedEntries = keyOrder
        .filter((key) => key in value)
        .map((key): [PropertyKey, unknown] => [key, value[key]]);

    return Object.assign(Object.fromEntries(orderedEntries), value);
}
