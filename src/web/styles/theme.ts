export type ThemeName = "dark" | "light";

export const THEME_STORAGE_KEY = "forja.theme";

const DEFAULT_THEME: ThemeName = "dark";
const THEME_NAMES: readonly ThemeName[] = ["dark", "light"];

export function readStoredTheme(storage: Pick<Storage, "getItem">): ThemeName {
    const storedTheme = storage.getItem(THEME_STORAGE_KEY);
    if (!isThemeName(storedTheme)) {
        return DEFAULT_THEME;
    }

    return storedTheme;
}

export function applyTheme(
    theme: ThemeName,
    root: HTMLElement,
    storage: Pick<Storage, "setItem">,
): void {
    root.dataset.theme = theme;
    storage.setItem(THEME_STORAGE_KEY, theme);
}

function isThemeName(candidate: string | null): candidate is ThemeName {
    return THEME_NAMES.some((themeName) => themeName === candidate);
}
