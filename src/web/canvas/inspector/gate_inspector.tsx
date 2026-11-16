import type { JSX } from "react";
import { z } from "zod";

import { isNodeOfType } from "@/shared/flow_graph.js";
import { GATE_REVIEW_SECTIONS } from "@/shared/node_configs/gate_config.js";
import type { GateConfig } from "@/shared/node_configs/gate_config.js";
import { fieldDoc } from "@/web/canvas/inspector/field_doc.js";
import { FieldHeading } from "@/web/canvas/inspector/field_heading.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorFields } from "@/web/canvas/inspector/inspector_section.js";
import { IntegerField } from "@/web/canvas/inspector/integer_field.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { withNodeConfig } from "@/web/canvas/inspector/node_updates.js";
import { TextAreaField } from "@/web/canvas/inspector/text_field.js";
import { Switch } from "@/web/components/ui/switch.js";

type GateReviewSection = GateConfig["show"][number];

const REVIEW_SECTION_LABELS: Record<GateReviewSection, string> = {
    diff: "Mostrar diff",
    artifacts: "Mostrar artefatos",
    logs: "Mostrar logs",
};

const MIN_GATE_TIMEOUT_HOURS = 1;
// The form asks for whole hours, a stricter subset of the positive hours the gate accepts.
const GATE_TIMEOUT_HOURS_SCHEMA = z.int().min(MIN_GATE_TIMEOUT_HOURS).optional();

export function GateInspector({ node, graph, onChange }: InspectorProps): JSX.Element {
    // The registry routes only gates here; the check narrows the node to its gate config.
    if (!isNodeOfType(node, "gate")) {
        return <></>;
    }

    const { config } = node;
    const changeConfig = (changes: Partial<GateConfig>): void =>
        onChange((current) => withNodeConfig(current, "gate", changes));

    return (
        <NodeInspectorFrame node={node} graph={graph} onChange={onChange}>
            <InspectorFields>
                <TextAreaField
                    doc={fieldDoc("gate", "message")}
                    text={config.message}
                    placeholder="O que a pessoa deve conferir antes de aprovar"
                    onChange={(message) => changeConfig({ message })}
                />
                <FieldHeading doc={fieldDoc("gate", "show")} />
                {GATE_REVIEW_SECTIONS.map((section) => (
                    <Switch
                        key={section}
                        label={REVIEW_SECTION_LABELS[section]}
                        checked={config.show.includes(section)}
                        onChange={(isShown) =>
                            changeConfig({ show: toggleSection(config.show, section, isShown) })
                        }
                    />
                ))}
                <IntegerField
                    doc={fieldDoc("gate", "timeoutHours")}
                    value={config.timeoutHours}
                    schema={GATE_TIMEOUT_HOURS_SCHEMA}
                    limits={{ min: MIN_GATE_TIMEOUT_HOURS }}
                    onChange={(timeoutHours) => changeConfig({ timeoutHours })}
                />
            </InspectorFields>
        </NodeInspectorFrame>
    );
}

function toggleSection(
    shownSections: GateReviewSection[],
    section: GateReviewSection,
    isShown: boolean,
): GateReviewSection[] {
    return GATE_REVIEW_SECTIONS.filter((candidate) =>
        candidate === section ? isShown : shownSections.includes(candidate),
    );
}
