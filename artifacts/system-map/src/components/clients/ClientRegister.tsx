import { useState } from "react";
import { Layers, Plus } from "lucide-react";
import GroupFeeEditor from "@/components/GroupFeeEditor";
import type { Client, ClientGroupSummary } from "@workspace/api-client-react";

type Section = { id: number | null; name: string; members: Client[] };

/** Left-hand register: nieuwe-cliënt knop, klantgroep-kopjes met overzicht, en de cliëntindex. */
export default function ClientRegister({
  clients,
  sections,
  groups,
  editing,
  startEdit,
  startCreate,
}: {
  clients: Client[];
  sections: Section[];
  groups: ClientGroupSummary[];
  editing: "new" | number | null;
  startEdit: (c: Client) => void;
  startCreate: () => void;
}) {
  const [openGroupOverview, setOpenGroupOverview] = useState<number | null>(
    null,
  );
  return (
    <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-foreground/20 pb-2">
              <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                Index
              </span>
              <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                {clients.length}{" "}
                {clients.length === 1 ? "cliënt" : "cliënten"}
              </span>
            </div>

            <button
              onClick={startCreate}
              data-testid="button-new-client"
              className="w-full py-3 px-4 bg-foreground text-background border-2 border-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-[4px_4px_0px_hsl(var(--accent))] hover:bg-accent hover:border-accent active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
            >
              <Plus className="w-4 h-4" />
              Nieuwe cliënt
            </button>

            <div className="flex flex-col border-t border-foreground/20">
              {clients.length === 0 && (
                <div className="px-4 py-12 text-center border-b border-foreground/20">
                  <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                    Nog geen cliënten in het register
                  </p>
                  <p className="text-sm text-muted-foreground mt-2 font-['Inter']">
                    Voeg je eerste cliënt toe om te beginnen.
                  </p>
                </div>
              )}
              {sections.map((section) => {
                const overviewOpen =
                  section.id != null && openGroupOverview === section.id;
                return (
                  <div key={section.id ?? "none"}>
                    {/* Klantgroep (kapstok) header */}
                    {section.id != null ? (
                      <button
                        onClick={() =>
                          setOpenGroupOverview((cur) =>
                            cur === section.id ? null : section.id,
                          )
                        }
                        data-testid={`group-header-${section.id}`}
                        className="w-full flex items-center gap-2 px-4 py-2.5 bg-foreground/5 border-b border-foreground/20 hover:bg-foreground/10 transition-colors text-left"
                      >
                        <Layers className="w-3.5 h-3.5 shrink-0 text-accent" />
                        <span className="flex-1 min-w-0 font-['Space_Mono'] text-[10px] uppercase tracking-widest truncate">
                          {section.name}
                        </span>
                        <span className="font-['Space_Mono'] text-[10px] text-muted-foreground shrink-0">
                          {section.members.length}
                        </span>
                      </button>
                    ) : (
                      <div className="px-4 py-2.5 bg-foreground/5 border-b border-foreground/20 flex items-center gap-2">
                        <span className="flex-1 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                          {section.name}
                        </span>
                        <span className="font-['Space_Mono'] text-[10px] text-muted-foreground shrink-0">
                          {section.members.length}
                        </span>
                      </div>
                    )}

                    {/* Lightweight group overview panel */}
                    {overviewOpen && (
                      <div
                        data-testid={`group-overview-${section.id}`}
                        className="px-4 py-3 border-b border-foreground/20 bg-accent/5"
                      >
                        <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-accent mb-2">
                          Kapstok-overzicht · {section.members.length}{" "}
                          {section.members.length === 1 ? "fiche" : "fiches"}
                        </p>
                        {(() => {
                          const group = groups.find(
                            (g) => g.id === section.id,
                          );
                          return group ? (
                            <GroupFeeEditor key={group.id} group={group} />
                          ) : null;
                        })()}
                        <ul className="flex flex-col gap-1">
                          {section.members.map((m) => (
                            <li key={m.id}>
                              <button
                                onClick={() => startEdit(m)}
                                className="text-left w-full font-['Inter'] text-sm hover:text-accent transition-colors truncate"
                              >
                                {m.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {section.members.map((c, i) => {
                      const active = editing === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => startEdit(c)}
                          data-testid={`client-row-${c.id}`}
                          className={`group flex items-start gap-4 text-left px-4 py-4 border-b border-foreground/20 transition-colors w-full ${
                            active
                              ? "bg-foreground text-background"
                              : "hover:bg-foreground hover:text-background"
                          }`}
                        >
                          <span
                            className={`font-['Space_Mono'] text-xs pt-1.5 shrink-0 ${
                              active
                                ? "text-background/60"
                                : "text-muted-foreground group-hover:text-background/60"
                            }`}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block font-['Playfair_Display'] font-bold text-lg leading-tight truncate">
                              {c.name}
                            </span>
                            {c.business && (
                              <span
                                className={`block text-xs mt-1 truncate font-['Inter'] ${
                                  active
                                    ? "text-background/70"
                                    : "text-muted-foreground group-hover:text-background/70"
                                }`}
                              >
                                {c.business}
                              </span>
                            )}
                          </span>
                          <span
                            className={`font-['Space_Mono'] text-[10px] uppercase tracking-widest pt-1.5 shrink-0 transition-opacity ${
                              active
                                ? "opacity-100 text-background/60"
                                : "opacity-0 group-hover:opacity-100 text-background/60"
                            }`}
                          >
                            Open
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
    </div>
  );
}
