import { Background, BackgroundVariant } from "@xyflow/react";
import type { JSX } from "react";

const DOT_GAP_PX = 20;

export function CanvasBackground(): JSX.Element {
    return <Background variant={BackgroundVariant.Dots} gap={DOT_GAP_PX} />;
}
