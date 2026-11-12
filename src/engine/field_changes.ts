export type FieldChange = { path: string; before: unknown; after: unknown };

type PlainObject = Record<string, unknown>;

const PATH_SEPARATOR = ".";

/** Walks into nested objects and reports each leaf that differs by its dotted path
 * (`config.effort`); lists and other values are compared as a whole. */
export function listFieldChanges(
    before: PlainObject,
    after: PlainObject,
    { ignoredFields = [] }: { ignoredFields?: readonly string[] } = {},
): FieldChange[] {
    return listFieldNames(before, after)
        .filter((fieldName) => !ignoredFields.includes(fieldName))
        .flatMap((fieldName) => listChangesUnder(fieldName, before[fieldName], after[fieldName]));
}

function listChangesUnder(path: string, before: unknown, after: unknown): FieldChange[] {
    if (isPlainObject(before) && isPlainObject(after)) {
        return listObjectChanges(path, before, after);
    }
    if (isSameValue(before, after)) {
        return [];
    }

    return [{ path, before, after }];
}

function listObjectChanges(path: string, before: PlainObject, after: PlainObject): FieldChange[] {
    return listFieldNames(before, after).flatMap((fieldName) =>
        listChangesUnder(joinPath(path, fieldName), before[fieldName], after[fieldName]),
    );
}

function listFieldNames(before: PlainObject, after: PlainObject): string[] {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])];
}

function joinPath(parentPath: string, fieldName: string): string {
    if (parentPath === "") {
        return fieldName;
    }

    return `${parentPath}${PATH_SEPARATOR}${fieldName}`;
}

function isSameValue(first: unknown, second: unknown): boolean {
    if (Array.isArray(first) && Array.isArray(second)) {
        return isSameList(first, second);
    }
    if (isPlainObject(first) && isPlainObject(second)) {
        return listObjectChanges("", first, second).length === 0;
    }

    return Object.is(first, second);
}

function isSameList(first: unknown[], second: unknown[]): boolean {
    return (
        first.length === second.length &&
        first.every((element, index) => isSameValue(element, second[index]))
    );
}

function isPlainObject(value: unknown): value is PlainObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
