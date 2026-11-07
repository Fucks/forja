import { useState } from "react";

import { applyTheme, readStoredTheme } from "@/web/styles/theme.js";
import type { ThemeName } from "@/web/styles/theme.js";

export function useTheme(): { theme: ThemeName; changeTheme: (theme: ThemeName) => void } {
    const [theme, setTheme] = useState(() => readStoredTheme(localStorage));

    function changeTheme(nextTheme: ThemeName): void {
        applyTheme(nextTheme, document.documentElement, localStorage);
        setTheme(nextTheme);
    }

    return { theme, changeTheme };
}
