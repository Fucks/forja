import type { JSX } from "react";

import { Drawer } from "@/web/components/ui/drawer.js";
import { NodeDocView } from "@/web/docs/node_doc_view.js";
import type { DocumentedType } from "@/web/docs/node_docs/node_doc.js";
import { getNodeDoc } from "@/web/docs/node_docs/node_docs.js";

const DRAWER_WIDTH_PX = 640;

export function NodeDocDrawer({
    type,
    open,
    onOpenChange,
}: {
    type: DocumentedType;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}): JSX.Element {
    return (
        <Drawer
            open={open}
            onOpenChange={onOpenChange}
            side="right"
            size={DRAWER_WIDTH_PX}
            title="Documentação do nó"
        >
            <NodeDocView doc={getNodeDoc(type)} placement="drawer" />
        </Drawer>
    );
}
