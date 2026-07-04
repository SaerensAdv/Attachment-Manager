import { X } from "lucide-react";
import type { ClientGroupSummary } from "@workspace/api-client-react";
import type { ClientEditorApi } from "@/hooks/useClientEditor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import GroupFeeFields from "./GroupFeeFields";
import BriefingSection from "./BriefingSection";
import CurrentStateSection from "./CurrentStateSection";
import LiveIntegrations from "./LiveIntegrations";
import BillingSection from "./BillingSection";
import OfferteSection from "./OfferteSection";
import DeckSection from "./DeckSection";
import ClientDocuments from "./ClientDocuments";
import EditorActions from "./EditorActions";

// Newsroom-styled tab chrome (square, ink borders, Space Mono caps) applied via
// className so we reuse the shared Radix primitive instead of forking it.
const TAB_LIST =
  "flex w-full h-auto rounded-none bg-card p-0 border border-foreground";
const TAB_TRIGGER =
  "flex-1 rounded-none border-r border-foreground/20 last:border-r-0 px-2 py-2.5 text-[11px] font-['Space_Mono'] uppercase tracking-widest text-foreground/60 hover:text-foreground hover:bg-foreground/5 data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none";
const TAB_CONTENT = "mt-0 pt-6 flex flex-col gap-8";

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

      <div className="p-6 flex flex-col gap-6">
        <Tabs defaultValue="profiel" className="flex flex-col gap-0">
          <TabsList className={TAB_LIST}>
            <TabsTrigger
              value="profiel"
              className={TAB_TRIGGER}
              data-testid="tab-dossier-profiel"
            >
              Profiel
            </TabsTrigger>
            <TabsTrigger
              value="live"
              className={TAB_TRIGGER}
              data-testid="tab-dossier-live"
            >
              Live data
            </TabsTrigger>
            <TabsTrigger
              value="facturatie"
              className={TAB_TRIGGER}
              data-testid="tab-dossier-facturatie"
            >
              Facturatie
            </TabsTrigger>
            <TabsTrigger
              value="documenten"
              className={TAB_TRIGGER}
              data-testid="tab-dossier-documenten"
            >
              Documenten
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profiel" className={TAB_CONTENT}>
            <GroupFeeFields editor={editor} groups={groups} />
            <BriefingSection editor={editor} />
            <CurrentStateSection editor={editor} />
          </TabsContent>

          <TabsContent value="live" className={TAB_CONTENT}>
            <LiveIntegrations editor={editor} />
          </TabsContent>

          <TabsContent value="facturatie" className={TAB_CONTENT}>
            <BillingSection editor={editor} groups={groups} />
            <OfferteSection editor={editor} />
          </TabsContent>

          <TabsContent value="documenten" className={TAB_CONTENT}>
            <DeckSection editor={editor} />
            <ClientDocuments editor={editor} />
          </TabsContent>
        </Tabs>

        {/* Persistent footer: save/delete + form errors stay reachable from any
            tab, so a save is never hidden behind the active section. */}
        <EditorActions editor={editor} />
      </div>
    </div>
  );
}
