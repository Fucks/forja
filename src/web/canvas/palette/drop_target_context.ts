import { createContext, useContext } from "react";

// The group under the cursor while a palette item is dragged over the canvas, if any.
export const DropTargetGroupContext = createContext<string | undefined>(undefined);

export function useIsDropTargetGroup(groupId: string): boolean {
    return useContext(DropTargetGroupContext) === groupId;
}
