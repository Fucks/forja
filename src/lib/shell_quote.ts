const SINGLE_QUOTE = "'";
// Closes the quoted string, adds an escaped quote and opens a new quoted string.
const ESCAPED_SINGLE_QUOTE = "'\\''";

// For values that go into a `sh -c` command line, such as a branch name.
export function quoteShellArgument(argument: string): string {
    const escaped = argument.replaceAll(SINGLE_QUOTE, ESCAPED_SINGLE_QUOTE);
    return `${SINGLE_QUOTE}${escaped}${SINGLE_QUOTE}`;
}
