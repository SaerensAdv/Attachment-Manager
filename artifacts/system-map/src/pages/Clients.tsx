import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  useGetClients,
  useGetClientGroups,
  type Client,
} from "@workspace/api-client-react";
import Reveal from "@/components/Reveal";
import ClientToolbox from "@/components/ClientToolbox";
import { useClientEditor } from "@/hooks/useClientEditor";
import ClientRegister from "@/components/clients/ClientRegister";
import ClientEditor from "@/components/clients/ClientEditor";

export default function Clients() {
  const { data, isLoading, error } = useGetClients();

  const clients = useMemo(
    () =>
      [...(data?.clients ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, "nl"),
      ),
    [data],
  );

  const { data: groupsData } = useGetClientGroups();
  const groups = useMemo(() => groupsData?.groups ?? [], [groupsData]);

  const editor = useClientEditor(groups);

  // Group the index into sections: named klantgroepen ("kapstokken") with
  // members OR a monthly fee, sorted by name, followed by an "Zonder groep"
  // block for ungrouped fiches. Empty, fee-less groups stay hidden as headers
  // (they remain selectable in the editor); a fee-bearing group must surface so
  // its fee can be edited even when it has no member fiches (e.g. an agency
  // relationship like SIX).
  const sections = useMemo(() => {
    const byGroup = new Map<number, Client[]>();
    const ungrouped: Client[] = [];
    for (const c of clients) {
      if (c.groupId != null) {
        const list = byGroup.get(c.groupId) ?? [];
        list.push(c);
        byGroup.set(c.groupId, list);
      } else {
        ungrouped.push(c);
      }
    }
    const named = groups
      .filter((g) => byGroup.has(g.id) || (g.monthlyFee ?? 0) > 0)
      .map((g) => ({
        id: g.id as number | null,
        name: g.name,
        members: byGroup.get(g.id) ?? [],
      }));
    // A fiche may reference a group that is missing from the list (e.g. a race);
    // surface those under a neutral fallback so they never disappear.
    for (const [gid, list] of byGroup) {
      if (!groups.some((g) => g.id === gid)) {
        named.push({ id: gid, name: "Onbekende groep", members: list });
      }
    }
    const result: { id: number | null; name: string; members: Client[] }[] = [
      ...named,
    ];
    if (ungrouped.length > 0) {
      result.push({ id: null, name: "Zonder groep", members: ungrouped });
    }
    return result;
  }, [clients, groups]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground font-['Inter']">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
            Register laden...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground font-['Inter'] px-6">
        <div className="max-w-md w-full border border-foreground bg-card p-8 text-center shadow-[4px_4px_0px_hsl(var(--foreground))]">
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-destructive mb-3">
            Storing
          </p>
          <h1 className="font-['Playfair_Display'] font-black text-2xl uppercase tracking-tight mb-2">
            Register onbereikbaar
          </h1>
          <p className="text-sm text-muted-foreground">
            Kon de cliënten niet laden. Controleer je verbinding of de
            API-status.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground font-['Inter']">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-20 pb-16">
        {/* Masthead */}
        <Reveal>
        <header className="border-b-2 border-foreground pb-5 mb-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                Saerens Advertising — Redactie
              </p>
              <h1 className="font-['Playfair_Display'] font-black text-3xl sm:text-4xl md:text-5xl uppercase tracking-tight leading-none">
                Cliëntenregister
              </h1>
            </div>
            <div className="text-right hidden sm:block shrink-0">
              <div className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                Editie
              </div>
              <div className="font-['Playfair_Display'] text-2xl italic leading-none mt-1">
                No. {String(clients.length).padStart(3, "0")}
              </div>
            </div>
          </div>
          <p className="font-['Inter'] text-sm text-muted-foreground mt-5 max-w-2xl">
            Beheer de cliëntfiches. Ze voeden automatisch de routering, intake,
            generatie en de Kaart.
          </p>
        </header>
        </Reveal>

        <ClientToolbox clients={clients} onChanged={editor.invalidate} />

        <div className="grid grid-cols-1 lg:grid-cols-[24rem_1fr] gap-10">
          {/* Register / index */}
          <ClientRegister
            clients={clients}
            sections={sections}
            groups={groups}
            editing={editor.editing}
            startEdit={editor.startEdit}
            startCreate={editor.startCreate}
          />

          {/* Dossier editor */}
          <div>
            <ClientEditor editor={editor} groups={groups} />
          </div>
        </div>
      </div>
    </div>
  );
}
