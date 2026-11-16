import { render, screen } from "@testing-library/react";

import { IntegerField } from "@/web/canvas/inspector/integer_field.js";
import { TextField } from "@/web/canvas/inspector/text_field.js";
import { fieldDoc } from "@/web/canvas/inspector/field_doc.js";
import { sourceConfigSchema } from "@/shared/node_configs/source_config.js";

describe("a documented field", () => {
    it("takes its label from the doc and shows the help beside it", () => {
        render(
            <IntegerField
                doc={fieldDoc("source", "limit")}
                value={20}
                schema={sourceConfigSchema.shape.limit}
                limits={{ min: 1, max: 100 }}
                onChange={vi.fn()}
            />,
        );

        expect(screen.getByRole("spinbutton", { name: "Máximo de itens" })).toHaveValue(20);
        expect(
            screen.getByRole("button", { name: "Ajuda sobre Máximo de itens" }),
        ).toBeInTheDocument();
    });

    it("keeps a plain label without help when it has no doc", () => {
        render(<TextField label="Nome do modelo" text="" onChange={vi.fn()} />);

        expect(screen.getByRole("textbox", { name: "Nome do modelo" })).toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
});
