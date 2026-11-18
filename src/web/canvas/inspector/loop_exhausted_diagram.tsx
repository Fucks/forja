import type { JSX } from "react";

import { FieldHint } from "@/web/canvas/inspector/field_hint.js";

const EXHAUSTED_PORT_LABEL = "Esgotou as voltas";
const VIEW_BOX = "0 0 260 64";
const BOX_WIDTH = 72;
const BOX_HEIGHT = 28;
const BOX_TOP = 26;
const TEXT_BASELINE = BOX_TOP + 18;
const ARROW_Y = BOX_TOP + BOX_HEIGHT / 2;
const ITERATION_BOX_LEFT = 4;
const CAP_BOX_LEFT = 94;
const EXHAUSTED_BOX_LEFT = 184;
const ARROW_LENGTH = 18;
const ARROW_HEAD_SIZE = 4;
const BACK_EDGE_PATH = "M 130 26 C 130 4, 40 4, 40 26";

/** How an item leaves a loop that reached its iteration cap without meeting its condition. */
export function LoopExhaustedDiagram({ maxIterations }: { maxIterations: number }): JSX.Element {
    return (
        <div className="flex flex-col gap-1">
            <svg
                role="img"
                aria-label={`Volta, teto de ${maxIterations} voltas, saída ${EXHAUSTED_PORT_LABEL}`}
                viewBox={VIEW_BOX}
                className="w-full text-muted"
            >
                <path d={BACK_EDGE_PATH} fill="none" stroke="currentColor" strokeDasharray="3 3" />
                <text x="85" y="10" fontSize="9" textAnchor="middle" fill="currentColor">
                    volta de novo
                </text>
                <StepBox left={ITERATION_BOX_LEFT} text="Volta" />
                <Arrow fromX={ITERATION_BOX_LEFT + BOX_WIDTH} />
                <StepBox left={CAP_BOX_LEFT} text={`Teto: ${maxIterations}`} />
                <Arrow fromX={CAP_BOX_LEFT + BOX_WIDTH} />
                <StepBox left={EXHAUSTED_BOX_LEFT} text="Esgotou" />
            </svg>
            <FieldHint>
                Ligue a porta {EXHAUSTED_PORT_LABEL} a uma Saída ‘Precisa de humano’.
            </FieldHint>
        </div>
    );
}

function StepBox({ left, text }: { left: number; text: string }): JSX.Element {
    return (
        <g>
            <rect
                x={left}
                y={BOX_TOP}
                width={BOX_WIDTH}
                height={BOX_HEIGHT}
                rx="4"
                fill="none"
                stroke="currentColor"
            />
            <text
                x={left + BOX_WIDTH / 2}
                y={TEXT_BASELINE}
                fontSize="10"
                textAnchor="middle"
                fill="currentColor"
            >
                {text}
            </text>
        </g>
    );
}

function Arrow({ fromX }: { fromX: number }): JSX.Element {
    const toX = fromX + ARROW_LENGTH;
    const shaft = `M ${fromX} ${ARROW_Y} L ${toX} ${ARROW_Y}`;
    const head =
        `M ${toX - ARROW_HEAD_SIZE} ${ARROW_Y - ARROW_HEAD_SIZE} ` +
        `L ${toX} ${ARROW_Y} L ${toX - ARROW_HEAD_SIZE} ${ARROW_Y + ARROW_HEAD_SIZE}`;

    return <path d={`${shaft} ${head}`} fill="none" stroke="currentColor" />;
}
