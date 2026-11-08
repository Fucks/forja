export interface SecretRedactor {
    register(value: string): void;
    redact(text: string): string;
}

const MASK = "••••";
const ELLIPSIS = "…";
const MIN_MASKABLE_LENGTH = 12;
const VISIBLE_SUFFIX_LENGTH = 4;
const PREFIX_SEPARATOR = "-";
const PREFIX_SEGMENT_COUNT = 3;
const MIN_REDACTABLE_LENGTH = 8;

export function maskSecret(value: string): string {
    if (value.length < MIN_MASKABLE_LENGTH) {
        return MASK;
    }

    const suffixStart = value.length - VISIBLE_SUFFIX_LENGTH;
    return findVisiblePrefix(value, suffixStart) + ELLIPSIS + value.slice(suffixStart);
}

export function createSecretRedactor(): SecretRedactor {
    const secrets = new Set<string>();

    return {
        register(value) {
            if (value.length >= MIN_REDACTABLE_LENGTH) {
                secrets.add(value);
            }
        },
        redact(text) {
            return sortLongestFirst(secrets).reduce(
                (redacted, secret) => redacted.replaceAll(secret, MASK),
                text,
            );
        },
    };
}

/** The identifying prefix of keys like "sk-ant-api03-", unless it would reach the visible suffix. */
function findVisiblePrefix(value: string, suffixStart: number): string {
    const segments = value.split(PREFIX_SEPARATOR);
    if (segments.length <= PREFIX_SEGMENT_COUNT) {
        return "";
    }

    const prefixSegments = segments.slice(0, PREFIX_SEGMENT_COUNT);
    const prefix = prefixSegments.join(PREFIX_SEPARATOR) + PREFIX_SEPARATOR;
    return prefix.length <= suffixStart ? prefix : "";
}

// A secret that contains another must be replaced first, or only its embedded part would be masked.
function sortLongestFirst(secrets: Set<string>): string[] {
    return [...secrets].sort((a, b) => b.length - a.length);
}
