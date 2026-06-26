import { X } from "lucide-react";
import type { ClientGroupSummary } from "@workspace/api-client-react";
import type { ClientEditorApi } from "@/hooks/useClientEditor";
import GroupFeeFields from "./GroupFeeFields";
import BriefingSection from "./BriefingSection";
import CurrentStateSection from "./CurrentStateSection";
import LiveIntegrations from "./LiveIntegrations";
import BillingSection from "./BillingSection";
import OfferteSection from "./OfferteSection";
import DeckSection from "./DeckSection";
import EditorActions from "./EditorActions";

/** Right-hand dossier editor: composes the section components for the open client. */
export default function ClientEditor({
  editor,
  groups,
}: {
  editor: ClientEditorApi;
  groups: ClientGroupSummary[];
}) {
  const { editing, closeEditor } = editor;

  if (editing === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 text-center border border-dashed border-foreground/30 bg-card py-24 px-6">
        <span className="font-['Playfair_Display'] font-black text-6xl text-foreground/10 leading-none">
          SA
        </span>
        <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
          Geen dossier geopend
        </p>
        <p className="text-sm text-muted-foreground max-w-sm font-['Inter']">
          Kies een cliënt uit het register om te bewerken, of stel een
          nieuw dossier samen.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-foreground bg-card shadow-[4px_4px_0px_hsl(var(--foreground))]">
      {/* Dossier header */}
      <div className="flex items-start justify-between gap-2 border-b-2 border-foreground px-6 py-5">
        <div>
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
            Dossier
          </p>
          <h2 className="font-['Playfair_Display'] font-black text-2xl uppercase tracking-tight leading-none mt-2">
            {editing === "new" ? "Nieuw dossier" : "Dossier bewerken"}
          </h2>
        </div>
        <button
          onClick={closeEditor}
          className="p-2 border border-foreground hover:bg-foreground hover:text-background transition-colors shrink-0"
          data-testid="button-close-editor"
          aria-label="Sluiten"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6 flex flex-col gap-8">
        <GroupFeeFields editor={editor} groups={groups} />
        <BriefingSection editor={editor} />
        <CurrentStateSection editor={editor} />
        <LiveIntegrations editor={editor} />
        <BillingSection editor={editor} />
        <OfferteSection editor={editor} />
        <DeckSection editor={editor} />
        <EditorActions editor={editor} />
      </div>
    </div>
  );
}
