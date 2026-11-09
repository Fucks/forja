import type { JSX } from "react";

import { PageTitle } from "@/web/app/page_title.js";
import { ButtonSamples, IconButtonSamples } from "@/web/app/styleguide/button_samples.js";
import {
    SegmentedControlSamples,
    SliderSamples,
    SwitchSamples,
} from "@/web/app/styleguide/choice_samples.js";
import {
    EmptyStateSamples,
    KeyValueSamples,
    SkeletonSamples,
    TabsSamples,
} from "@/web/app/styleguide/content_samples.js";
import {
    DialogSamples,
    DrawerSamples,
    ToastSamples,
    TooltipSamples,
} from "@/web/app/styleguide/overlay_samples.js";
import { LogViewerSamples } from "@/web/app/styleguide/log_viewer_samples.js";
import { StatusBadgeSamples } from "@/web/app/styleguide/status_badge_samples.js";
import { SelectSamples, TextFieldSamples } from "@/web/app/styleguide/text_field_samples.js";

export function StyleguidePage(): JSX.Element {
    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-1">
                <PageTitle>Styleguide</PageTitle>
                <p className="text-muted">
                    Todos os componentes do design system. Use a alternância de tema na barra
                    superior para conferir os dois temas.
                </p>
            </header>
            <ButtonSamples />
            <IconButtonSamples />
            <TextFieldSamples />
            <SelectSamples />
            <SwitchSamples />
            <SliderSamples />
            <SegmentedControlSamples />
            <StatusBadgeSamples />
            <TooltipSamples />
            <ToastSamples />
            <DialogSamples />
            <DrawerSamples />
            <TabsSamples />
            <EmptyStateSamples />
            <SkeletonSamples />
            <KeyValueSamples />
            <LogViewerSamples />
        </div>
    );
}
