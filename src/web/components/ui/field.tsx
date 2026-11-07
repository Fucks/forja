import { createContext, use } from "react";
import type { JSX, ReactNode } from "react";

interface FieldControlContextValue {
    controlId: string;
    descriptionIds: string[];
    isInvalid: boolean;
}

interface OwnControlAttributes {
    id: string | undefined;
    describedBy: string | undefined;
    invalid: boolean;
}

interface FieldControlAttributes {
    attributes: { id?: string; "aria-describedby"?: string; "aria-invalid"?: true };
    isInvalid: boolean;
}

const FieldControlContext = createContext<FieldControlContextValue | undefined>(undefined);

export function Field({
    label,
    hint,
    error,
    htmlFor,
    children,
}: {
    label: string;
    hint?: string;
    error?: string;
    htmlFor: string;
    children: ReactNode;
}): JSX.Element {
    const hintId = `${htmlFor}-hint`;
    const errorId = `${htmlFor}-error`;
    const descriptionIds = [hint && hintId, error && errorId].filter(isNonEmptyString);

    return (
        <div className="flex flex-col gap-1">
            <label htmlFor={htmlFor} className="text-sm font-medium text-text">
                {label}
            </label>
            <FieldControlContext
                value={{ controlId: htmlFor, descriptionIds, isInvalid: Boolean(error) }}
            >
                {children}
            </FieldControlContext>
            {hint && (
                <p id={hintId} className="text-xs text-muted">
                    {hint}
                </p>
            )}
            {error && (
                <p id={errorId} className="text-xs text-status-failed">
                    {error}
                </p>
            )}
        </div>
    );
}

export function useFieldControlAttributes(own: OwnControlAttributes): FieldControlAttributes {
    const field = use(FieldControlContext);
    const describedBy = [own.describedBy, ...(field?.descriptionIds ?? [])].filter(
        isNonEmptyString,
    );
    const isInvalid = own.invalid || Boolean(field?.isInvalid);

    return {
        attributes: {
            id: own.id ?? field?.controlId,
            "aria-describedby": describedBy.length > 0 ? describedBy.join(" ") : undefined,
            "aria-invalid": isInvalid || undefined,
        },
        isInvalid,
    };
}

function isNonEmptyString(candidate: string | undefined | false): candidate is string {
    return Boolean(candidate);
}
