import type { OptionCard } from "@/web/canvas/inspector/option_cards.js";
import type { DocumentedType, FieldDoc } from "@/web/docs/node_docs/node_doc.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";

export class UndocumentedFieldError extends Error {
    constructor(documentedName: string) {
        super(`No documentation for ${documentedName}`);
        this.name = "UndocumentedFieldError";
    }
}

// Every inspector is rendered in the tests, so a missing doc fails them instead of hiding the help.
export function fieldDoc(type: DocumentedType, key: string): FieldDoc {
    const doc = getNodeDoc(type).fields.find((field) => field.key === key);
    if (!doc) {
        throw new UndocumentedFieldError(`${type}.${key}`);
    }

    return doc;
}

export function fieldOptionCards<T extends string>(
    doc: FieldDoc,
    values: readonly T[],
): OptionCard<T>[] {
    return values.map((value) => {
        const option = doc.options?.find((candidate) => candidate.value === value);
        if (!option) {
            throw new UndocumentedFieldError(`${doc.key}.${value}`);
        }

        return { value, label: option.label, description: option.description };
    });
}
