import { createContext, use } from "react";

import type { ProjectSettings } from "@/shared/settings_types.js";

// Undefined while the project's settings load; the fields then only say that the value is inherited.
export const InheritedSettingsContext = createContext<ProjectSettings | undefined>(undefined);

export function useInheritedSettings(): ProjectSettings | undefined {
    return use(InheritedSettingsContext);
}
