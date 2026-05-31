import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetClients,
  useCreateClient,
  useUpdateClient,
  useDeleteClient,
  getGetClientsQueryKey,
  getGetDocGraphQueryKey,
  type Client,
  type ClientInput,
} from "@workspace/api-client-react";
import {
  Loader2,
  Users,
  Plus,
  Save,
  Trash2,
  X,
  Pencil,
  Building2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type FieldKey = Exclude<keyof ClientInput, "name">;

type FormState = Record<keyof ClientInput, string>;

interface FieldDef {
  key: FieldKey;
  label: string;
  kind: "input" | "textarea" | "list";
  placeholder?: string;
  help?: string;
}

// One source of truth for the editor form, mirroring clients/_template.md.
// "list" fields render as a textarea where every line becomes a bullet in the
// generated markdown brain.
const FIELDS: FieldDef[] = [
  {
    key: "business",
    label: "Business",
    kind: "textarea",
    placeholder: "Wat doet het bedrijf? Welke producten/diensten verkopen ze?",
  },
  {
    key: "world",
    label: "Wereld",
    kind: "input",
    placeholder: "E-commerce of Lead generation",
  },
  {
    key: "services",
    label: "Diensten / producten",
    kind: "list",
    placeholder: "Eén dienst of product per regel",
    help: "Eén per regel",
  },
  {
    key: "audience",
    label: "Doelgroep",
    kind: "list",
    placeholder: "Eén doelgroep per regel",
    help: "Eén per regel",
  },
  {
    key: "locations",
    label: "Locaties / regio's",
    kind: "list",
    placeholder: "Bv. Vlaanderen, Brussel, heel België",
    help: "Eén per regel",
  },
  {
    key: "languages",
    label: "Talen",
    kind: "input",
    placeholder: "Bv. Nederlands, Frans",
  },
  {
    key: "mainGoal",
    label: "Hoofddoel",
    kind: "textarea",
    placeholder: "Wat wil de klant bereiken met Google Ads?",
  },
  {
    key: "conversionAction",
    label: "Primaire conversie-actie",
    kind: "textarea",
    placeholder: "Bv. offerte-aanvraag, aankoop, telefoontje",
  },
  {
    key: "kpis",
    label: "Doelstellingen / KPI's",
    kind: "textarea",
    placeholder: "Bv. ROAS 4, CPA onder €30, 50 leads per maand",
  },
  {
    key: "budget",
    label: "Budget",
    kind: "input",
    placeholder: "Bv. €2.000 / maand",
  },
  {
    key: "toneOfVoice",
    label: "Tone of voice",
    kind: "input",
    placeholder: "Bv. professioneel, toegankelijk, no-nonsense",
  },
  {
    key: "channels",
    label: "Advertentiekanalen",
    kind: "list",
    placeholder: "Bv. Search, Performance Max, Display, YouTube",
    help: "Eén per regel",
  },
  {
    key: "restrictions",
    label: "Merkrestricties & notities",
    kind: "textarea",
    placeholder: "Belangrijke do's & don'ts, merkregels, gevoeligheden",
  },
  {
    key: "website",
    label: "Website",
    kind: "input",
    placeholder: "https://...",
  },
  {
    key: "landingPages",
    label: "Landingspagina's",
    kind: "input",
    placeholder: "Belangrijkste landingspagina's",
  },
];

const EMPTY_FORM: FormState = {
  name: "",
  business: "",
  world: "",
  services: "",
  audience: "",
  locations: "",
  languages: "",
  mainGoal: "",
  conversionAction: "",
  kpis: "",
  budget: "",
  toneOfVoice: "",
  channels: "",
  restrictions: "",
  website: "",
  landingPages: "",
};

function clientToForm(c: Client): FormState {
  const out = { ...EMPTY_FORM };
  for (const k of Object.keys(EMPTY_FORM) as (keyof ClientInput)[]) {
    const v = (c as unknown as Record<string, unknown>)[k];
    out[k] = typeof v === "string" ? v : "";
  }
  return out;
}

function formToInput(f: FormState): ClientInput {
  const out: Record<string, string | null> = {};
  for (const k of Object.keys(EMPTY_FORM) as (keyof ClientInput)[]) {
    const v = f[k].trim();
    out[k] = k === "name" ? v : v === "" ? null : v;
  }
  return out as unknown as ClientInput;
}

export default function Clients() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useGetClients();

  const clients = useMemo(
    () =>
      [...(data?.clients ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, "nl"),
      ),
    [data],
  );

  // null = nothing open, "new" = create form, number = editing that id.
  const [editing, setEditing] = useState<"new" | number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
    // The doc graph merges DB clients, so refresh it too — the new/updated
    // client must surface in the Genereren dropdown and the Kaart graph.
    queryClient.invalidateQueries({ queryKey: getGetDocGraphQueryKey() });
  };

  const createMut = useCreateClient();
  const updateMut = useUpdateClient();
  const deleteMut = useDeleteClient();

  const saving = createMut.isPending || updateMut.isPending;
  const deleting = deleteMut.isPending;

  const startCreate = () => {
    setEditing("new");
    setForm(EMPTY_FORM);
    setFormError(null);
    setConfirmDelete(false);
  };

  const startEdit = (c: Client) => {
    setEditing(c.id);
    setForm(clientToForm(c));
    setFormError(null);
    setConfirmDelete(false);
  };

  const closeEditor = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setConfirmDelete(false);
  };

  const setField = (key: keyof ClientInput, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (!form.name.trim()) {
      setFormError("Geef de klant minstens een naam.");
      return;
    }
    setFormError(null);
    const payload = formToInput(form);

    const onError = (err: unknown) =>
      setFormError(err instanceof Error ? err.message : "Opslaan mislukt");

    if (editing === "new") {
      createMut.mutate(
        { data: payload },
        {
          onSuccess: (created) => {
            invalidate();
            setEditing(created.id);
            setForm(clientToForm(created));
          },
          onError,
        },
      );
    } else if (typeof editing === "number") {
      updateMut.mutate(
        { id: editing, data: payload },
        {
          onSuccess: (updated) => {
            invalidate();
            setForm(clientToForm(updated));
          },
          onError,
        },
      );
    }
  };

  const handleDelete = () => {
    if (typeof editing !== "number") return;
    deleteMut.mutate(
      { id: editing },
      {
        onSuccess: () => {
          invalidate();
          closeEditor();
        },
        onError: (err) =>
          setFormError(
            err instanceof Error ? err.message : "Verwijderen mislukt",
          ),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <Loader2 className="w-8 h-8 animate-spin text-cat-agent" />
          <p className="font-mono text-sm tracking-widest text-muted-foreground">
            LADEN...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">
            Kon de klanten niet laden
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Controleer je verbinding of de API-status.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-10 grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-6">
        {/* Client list */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="font-mono font-bold tracking-tight text-2xl uppercase flex items-center gap-2">
              <Users className="w-5 h-5 text-cat-agent" />
              Klanten
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Beheer je klantenfiches. Ze voeden automatisch de routering,
              intake, generatie en de Kaart.
            </p>
          </div>

          <Button onClick={startCreate} data-testid="button-new-client">
            <Plus className="w-4 h-4" />
            Nieuwe klant
          </Button>

          <div className="flex flex-col gap-2">
            {clients.length === 0 && (
              <div className="text-sm text-muted-foreground rounded-lg border border-dashed border-card-border bg-card/40 px-4 py-6 text-center">
                Nog geen klanten. Voeg je eerste klant toe.
              </div>
            )}
            {clients.map((c) => {
              const active = editing === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => startEdit(c)}
                  data-testid={`client-row-${c.id}`}
                  className={`group flex items-start gap-3 text-left rounded-lg border px-4 py-3 transition-colors ${
                    active
                      ? "border-cat-agent/40 bg-cat-agent/10"
                      : "border-card-border bg-card/60 hover:bg-card"
                  }`}
                >
                  <Building2
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      active ? "text-cat-agent" : "text-muted-foreground"
                    }`}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{c.name}</span>
                    {c.business && (
                      <span className="block text-xs text-muted-foreground truncate">
                        {c.business}
                      </span>
                    )}
                  </span>
                  <Pencil className="w-3.5 h-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Editor */}
        <div className="flex flex-col gap-4">
          {editing === null ? (
            <div className="flex flex-col items-center justify-center gap-3 text-center rounded-lg border border-dashed border-card-border bg-card/40 py-20 px-6">
              <Users className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground max-w-sm">
                Kies een klant om te bewerken, of maak een nieuwe klant aan.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5 bg-card/60 border border-card-border rounded-lg p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  {editing === "new" ? "Nieuwe klant" : "Klant bewerken"}
                </span>
                <button
                  onClick={closeEditor}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-close-editor"
                  aria-label="Sluiten"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Naam <span className="text-cat-agent">*</span>
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="Bedrijfsnaam van de klant"
                  data-testid="input-client-name"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FIELDS.map((f) => (
                  <div
                    key={f.key}
                    className={`flex flex-col gap-1.5 ${
                      f.kind === "textarea" || f.kind === "list"
                        ? "md:col-span-2"
                        : ""
                    }`}
                  >
                    <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      {f.label}
                      {f.help && (
                        <span className="text-[10px] normal-case tracking-normal text-muted-foreground/60">
                          ({f.help})
                        </span>
                      )}
                    </label>
                    {f.kind === "input" ? (
                      <Input
                        value={form[f.key]}
                        onChange={(e) => setField(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        data-testid={`input-client-${f.key}`}
                      />
                    ) : (
                      <Textarea
                        value={form[f.key]}
                        onChange={(e) => setField(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        rows={f.kind === "list" ? 3 : 4}
                        className="resize-none"
                        data-testid={`input-client-${f.key}`}
                      />
                    )}
                  </div>
                ))}
              </div>

              {formError && (
                <div
                  className="text-sm text-destructive"
                  data-testid="text-form-error"
                >
                  ⚠️ {formError}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  data-testid="button-save-client"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {editing === "new" ? "Klant aanmaken" : "Wijzigingen opslaan"}
                </Button>

                <Button
                  variant="ghost"
                  onClick={closeEditor}
                  disabled={saving}
                  data-testid="button-cancel"
                >
                  Annuleren
                </Button>

                {typeof editing === "number" && (
                  <div className="ml-auto flex items-center gap-2">
                    {confirmDelete ? (
                      <>
                        <span className="text-xs text-muted-foreground">
                          Zeker?
                        </span>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleDelete}
                          disabled={deleting}
                          data-testid="button-confirm-delete"
                        >
                          {deleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                          Verwijderen
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDelete(false)}
                          disabled={deleting}
                        >
                          Nee
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDelete(true)}
                        className="text-destructive hover:text-destructive"
                        data-testid="button-delete-client"
                      >
                        <Trash2 className="w-4 h-4" />
                        Verwijderen
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
