import { X, AlertTriangle } from "lucide-react";
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
import ClientTechnicalConfig from "./ClientTechnicalConfig";
import "@/pages/ClientOwnership.css";

const TAB_LIST="flex w-full h-auto rounded-none bg-card p-0 border border-foreground";
const TAB_TRIGGER="flex-1 rounded-none border-r border-foreground/20 last:border-r-0 px-2 py-2.5 text-[11px] font-['Space_Mono'] uppercase tracking-widest text-foreground/60 hover:text-foreground hover:bg-foreground/5 data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none";
const TAB_CONTENT="mt-0 pt-6 flex flex-col gap-8";

export default function ClientEditor({editor,groups}:{editor:ClientEditorApi;groups:ClientGroupSummary[]}){
  const{editing,closeEditor}=editor;
  if(editing===null)return <div className="clients-state"><p>No client selected.</p></div>;
  if(typeof editing==="number")return <ClientTechnicalConfig clientId={editing}/>;
  return <div className="border border-foreground bg-card shadow-[4px_4px_0px_hsl(var(--foreground))]">
    <div className="flex items-start justify-between gap-2 border-b-2 border-foreground px-6 py-5"><div><p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">Exceptional onboarding</p><h2 className="font-['Plus_Jakarta_Sans'] font-bold text-2xl tracking-tight leading-none mt-2">Unlinked technical record</h2></div><button onClick={closeEditor} className="p-2 border border-foreground hover:bg-foreground hover:text-background transition-colors" aria-label="Close"><X className="w-4 h-4"/></button></div>
    <div className="p-6 flex flex-col gap-6"><div className="flex gap-3 border border-amber-500/40 bg-amber-500/5 p-4"><AlertTriangle className="w-4 h-4 shrink-0 text-amber-400"/><span><b className="text-sm">Compatibility onboarding only</b><p className="mt-1 text-xs text-muted-foreground">ClickUp Companies is the customer master. Create a local record only when technical delivery must start before a Company link exists, then link it as soon as possible.</p></span></div>
      <Tabs defaultValue="profiel"><TabsList className={TAB_LIST}><TabsTrigger value="profiel" className={TAB_TRIGGER}>Onboarding</TabsTrigger><TabsTrigger value="live" className={TAB_TRIGGER}>Integrations</TabsTrigger><TabsTrigger value="facturatie" className={TAB_TRIGGER}>Legacy billing</TabsTrigger><TabsTrigger value="documenten" className={TAB_TRIGGER}>Outputs</TabsTrigger></TabsList>
        <TabsContent value="profiel" className={TAB_CONTENT}><GroupFeeFields editor={editor} groups={groups}/><BriefingSection editor={editor}/><CurrentStateSection editor={editor}/></TabsContent>
        <TabsContent value="live" className={TAB_CONTENT}><LiveIntegrations editor={editor}/></TabsContent>
        <TabsContent value="facturatie" className={TAB_CONTENT}><BillingSection editor={editor} groups={groups}/><OfferteSection editor={editor}/></TabsContent>
        <TabsContent value="documenten" className={TAB_CONTENT}><DeckSection editor={editor}/><ClientDocuments editor={editor}/></TabsContent>
      </Tabs><EditorActions editor={editor}/></div>
  </div>;
}
