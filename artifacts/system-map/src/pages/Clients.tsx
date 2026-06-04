import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetClients,
  useCreateClient,
  useUpdateClient,
  useDeleteClient,
  useClientWebsiteIntake,
  useClientGoogleAdsRefresh,
  getGetClientsQueryKey,
  getGetDocGraphQueryKey,
  type Client,
  type ClientInput,
} from "@workspace/api-client-react";
import { BarChart3, Globe, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Reveal from "@/components/Reveal";
import {
  FIELDS,
  STATE_FIELDS,
  EMPTY_FORM,
  INPUT_CLASS,
  MAX_STATE_FIELD_LEN,
  clientToForm,
  formToInput,
  asConflict,
  type FieldDef,
  type FormState,
} from "@/lib/clients-form";

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
  // Website-intake (fase 2) is managed outside the editable form: it is set by
  // the read-website endpoint, not by the briefing fields.
  const [intake, setIntake] = useState<{
    text: string | null;
    at: string | null;
  }>({ text: null, at: null });
  // Live Google Ads (fase 3) — set by the google-ads-refresh endpoint; the
  // customer id itself is an editable briefing field.
  const [liveAds, setLiveAds] = useState<{
    text: string | null;
    at: string | null;
  }>({ text: null, at: null });
  // Optimistic concurrency: the `updatedAt` of the row as it was loaded into the
  // editor. We echo it back on save so the server can reject (409) if someone
  // else changed the fiche in the meantime, instead of silently overwriting.
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
    // The doc graph merges DB clients, so refresh it too — the new/updated
    // client must surface in the Kaart command bar and the Kaart graph.
    queryClient.invalidateQueries({ queryKey: getGetDocGraphQueryKey() });
  };

  const createMut = useCreateClient();
  const updateMut = useUpdateClient();
  const deleteMut = useDeleteClient();
  const intakeMut = useClientWebsiteIntake();
  const adsMut = useClientGoogleAdsRefresh();

  const saving = createMut.isPending || updateMut.isPending;
  const deleting = deleteMut.isPending;
  const intaking = intakeMut.isPending;
  const refreshingAds = adsMut.isPending;

  const startCreate = () => {
    setEditing("new");
    setForm(EMPTY_FORM);
    setFormError(null);
    setConfirmDelete(false);
    setIntake({ text: null, at: null });
    setLiveAds({ text: null, at: null });
    setEditingUpdatedAt(null);
  };

  const startEdit = (c: Client) => {
    setEditing(c.id);
    setForm(clientToForm(c));
    setFormError(null);
    setConfirmDelete(false);
    setIntake({ text: c.websiteIntake ?? null, at: c.websiteIntakeAt ?? null });
    setLiveAds({
      text: c.googleAdsLive ?? null,
      at: c.googleAdsLiveAt ?? null,
    });
    setEditingUpdatedAt(c.updatedAt);
  };

  const closeEditor = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setConfirmDelete(false);
    setIntake({ text: null, at: null });
    setLiveAds({ text: null, at: null });
    setEditingUpdatedAt(null);
  };

  const setField = (key: keyof ClientInput, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (!form.name.trim()) {
      setFormError("Geef de cliënt minstens een naam.");
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
            setEditingUpdatedAt(created.updatedAt);
          },
          onError,
        },
      );
    } else if (typeof editing === "number") {
      updateMut.mutate(
        // Echo back the loaded `updatedAt` so the server can detect a
        // concurrent edit. The generated client JSON-stringifies the whole
        // payload, so this extra field reaches the API even though it isn't
        // part of the typed ClientInput shape.
        {
          id: editing,
          data: { ...payload, updatedAt: editingUpdatedAt } as ClientInput,
        },
        {
          onSuccess: (updated) => {
            invalidate();
            setForm(clientToForm(updated));
            setEditingUpdatedAt(updated.updatedAt);
          },
          onError: (err) => {
            // 409: someone else changed the fiche first. Refresh the editor
            // with the current row so the user can re-apply their change.
            const conflict = asConflict(err);
            if (conflict) {
              invalidate();
              setForm(clientToForm(conflict));
              setEditingUpdatedAt(conflict.updatedAt);
              setFormError(
                "Deze fiche is intussen elders aangepast. De nieuwste versie is geladen — voer je wijziging opnieuw door.",
              );
              return;
            }
            onError(err);
          },
        },
      );
    }
  };

  const handleWebsiteIntake = () => {
    if (typeof editing !== "number") return;
    setFormError(null);
    intakeMut.mutate(
      { id: editing },
      {
        onSuccess: (updated) => {
          invalidate();
          setForm(clientToForm(updated));
          setIntake({
            text: updated.websiteIntake ?? null,
            at: updated.websiteIntakeAt ?? null,
          });
        },
        onError: (err) =>
          setFormError(
            err instanceof Error ? err.message : "Website uitlezen mislukt",
          ),
      },
    );
  };

  const handleGoogleAds = () => {
    if (typeof editing !== "number") return;
    setFormError(null);
    adsMut.mutate(
      { id: editing },
      {
        onSuccess: (updated) => {
          invalidate();
          setForm(clientToForm(updated));
          setLiveAds({
            text: updated.googleAdsLive ?? null,
            at: updated.googleAdsLiveAt ?? null,
          });
        },
        onError: (err) =>
          setFormError(
            err instanceof Error ? err.message : "Google Ads ophalen mislukt",
          ),
      },
    );
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
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-16">
        {/* Masthead */}
        <Reveal>
        <header className="border-b-2 border-foreground pb-5 mb-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                Saerens Advertising — Redactie
              </p>
              <h1 className="font-['Playfair_Display'] font-black text-4xl md:text-5xl uppercase tracking-tight leading-none">
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

        <div className="grid grid-cols-1 lg:grid-cols-[24rem_1fr] gap-10">
          {/* Register / index */}
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
              {clients.map((c, i) => {
                const active = editing === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => startEdit(c)}
                    data-testid={`client-row-${c.id}`}
                    className={`group flex items-start gap-4 text-left px-4 py-4 border-b border-foreground/20 transition-colors ${
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
          </div>

          {/* Dossier editor */}
          <div>
            {editing === null ? (
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
            ) : (
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
                  {/* Section heading */}
                  <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                    <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                      I. Briefing
                    </h3>
                    <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                      {FIELDS.length + STATE_FIELDS.length + 1} velden
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Name — 01 */}
                    <div className="md:col-span-2 flex flex-col gap-2">
                      <div className="flex items-baseline gap-3 border-b border-foreground/20 pb-1">
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          01
                        </span>
                        <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest flex-1">
                          Naam <span className="text-accent">*</span>
                        </label>
                      </div>
                      <Input
                        value={form.name}
                        onChange={(e) => setField("name", e.target.value)}
                        placeholder="Bedrijfsnaam van de cliënt"
                        data-testid="input-client-name"
                        className={INPUT_CLASS}
                      />
                    </div>

                    {FIELDS.map((f, i) => (
                      <div
                        key={f.key}
                        className={`flex flex-col gap-2 ${
                          f.kind === "textarea" || f.kind === "list"
                            ? "md:col-span-2"
                            : ""
                        }`}
                      >
                        <div className="flex items-baseline gap-3 border-b border-foreground/20 pb-1">
                          <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                            {String(i + 2).padStart(2, "0")}
                          </span>
                          <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest flex-1">
                            {f.label}
                          </label>
                          {f.help && (
                            <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60 italic">
                              {f.help}
                            </span>
                          )}
                        </div>
                        {f.kind === "input" ? (
                          <Input
                            value={form[f.key]}
                            onChange={(e) => setField(f.key, e.target.value)}
                            placeholder={f.placeholder}
                            data-testid={`input-client-${f.key}`}
                            className={INPUT_CLASS}
                          />
                        ) : (
                          <Textarea
                            value={form[f.key]}
                            onChange={(e) => setField(f.key, e.target.value)}
                            placeholder={f.placeholder}
                            rows={f.kind === "list" ? 3 : 4}
                            data-testid={`input-client-${f.key}`}
                            className={`${INPUT_CLASS} resize-none`}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Section II — current state */}
                  <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                    <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                      II. Huidige stand
                    </h3>
                    <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                      Voedt de audits
                    </span>
                  </div>

                  <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                    De echte stand van zaken voor deze cliënt. Plak hier exports of
                    kerncijfers — de agents gebruiken dit als bron in plaats van
                    "ontbrekende data" te rapporteren.
                  </p>

                  <div className="grid grid-cols-1 gap-6">
                    {STATE_FIELDS.map((f, i) => (
                      <div key={f.key} className="flex flex-col gap-2">
                        <div className="flex items-baseline gap-3 border-b border-foreground/20 pb-1">
                          <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                            {String(FIELDS.length + 2 + i).padStart(2, "0")}
                          </span>
                          <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest flex-1">
                            {f.label}
                          </label>
                          {f.help && (
                            <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60 italic">
                              {f.help}
                            </span>
                          )}
                        </div>
                        <Textarea
                          value={form[f.key]}
                          onChange={(e) => setField(f.key, e.target.value)}
                          placeholder={f.placeholder}
                          rows={6}
                          maxLength={MAX_STATE_FIELD_LEN}
                          data-testid={`input-client-${f.key}`}
                          className={`${INPUT_CLASS} resize-y font-['Space_Mono'] text-xs`}
                        />
                        <span
                          className={`font-['Space_Mono'] text-[9px] tracking-wider self-end ${
                            form[f.key].length > MAX_STATE_FIELD_LEN * 0.9
                              ? "text-destructive"
                              : "text-muted-foreground/50"
                          }`}
                        >
                          {form[f.key].length.toLocaleString("nl-BE")} /{" "}
                          {MAX_STATE_FIELD_LEN.toLocaleString("nl-BE")}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Section III — website intake (existing clients only) */}
                  {typeof editing === "number" && (
                    <>
                      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                          III. Website-intake
                        </h3>
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          Leest de site uit
                        </span>
                      </div>

                      <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                        Lees de eigen website van de cliënt uit (homepage +
                        opgegeven landingspagina's). De ruwe tekst wordt bewaard en
                        meegegeven aan de agents, zodat ze weten wat er écht op de
                        site staat.
                      </p>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleWebsiteIntake}
                          disabled={intaking || !form.website.trim()}
                          data-testid="button-website-intake"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {intaking ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Globe className="w-4 h-4" />
                          )}
                          {intake.text ? "Opnieuw uitlezen" : "Website uitlezen"}
                        </button>
                        {!form.website.trim() ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul eerst het veld Website in
                          </span>
                        ) : intake.at ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground">
                            Laatst uitgelezen:{" "}
                            {new Date(intake.at).toLocaleString("nl-BE", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        ) : (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Nog niet uitgelezen
                          </span>
                        )}
                      </div>

                      {intake.text && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-baseline justify-between border-b border-foreground/20 pb-1">
                            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                              Uitgelezen tekst
                            </span>
                            <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                              {intake.text.length.toLocaleString("nl-BE")} tekens
                            </span>
                          </div>
                          <pre
                            data-testid="text-website-intake"
                            className="max-h-72 overflow-auto whitespace-pre-wrap break-words border border-foreground/30 bg-background p-3 font-['Space_Mono'] text-[11px] leading-relaxed text-muted-foreground"
                          >
                            {intake.text}
                          </pre>
                        </div>
                      )}
                    </>
                  )}

                  {/* Section IV — live Google Ads (existing clients only) */}
                  {typeof editing === "number" && (
                    <>
                      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                          IV. Live Google Ads
                        </h3>
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          Leest het account uit
                        </span>
                      </div>

                      <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                        Haalt live cijfers op uit het Google Ads-account van de
                        cliënt (laatste 30 dagen): accounttotalen, campagnes en top
                        zoektermen. Alleen-lezen — er wordt nooit iets gewijzigd in
                        Google Ads. De data wordt bewaard en meegegeven aan de
                        agents.
                      </p>

                      <div className="flex flex-col gap-1.5">
                        <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                          Google Ads customer ID
                        </label>
                        <Input
                          value={form.googleAdsCustomerId}
                          onChange={(e) =>
                            setField("googleAdsCustomerId", e.target.value)
                          }
                          placeholder="Bv. 123-456-7890"
                          data-testid="input-client-googleAdsCustomerId"
                          className={INPUT_CLASS}
                        />
                        <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                          Bewaar het ID eerst met "Wijzigingen opslaan" voor je
                          ophaalt.
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleGoogleAds}
                          disabled={
                            refreshingAds || !form.googleAdsCustomerId.trim()
                          }
                          data-testid="button-google-ads-refresh"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {refreshingAds ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <BarChart3 className="w-4 h-4" />
                          )}
                          {liveAds.text ? "Opnieuw ophalen" : "Google Ads ophalen"}
                        </button>
                        {!form.googleAdsCustomerId.trim() ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul eerst het customer ID in
                          </span>
                        ) : liveAds.at ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground">
                            Laatst opgehaald:{" "}
                            {new Date(liveAds.at).toLocaleString("nl-BE", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        ) : (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Nog niet opgehaald
                          </span>
                        )}
                      </div>

                      {liveAds.text && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-baseline justify-between border-b border-foreground/20 pb-1">
                            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                              Opgehaalde data
                            </span>
                            <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                              {liveAds.text.length.toLocaleString("nl-BE")} tekens
                            </span>
                          </div>
                          <pre
                            data-testid="text-google-ads-live"
                            className="max-h-72 overflow-auto whitespace-pre-wrap break-words border border-foreground/30 bg-background p-3 font-['Space_Mono'] text-[11px] leading-relaxed text-muted-foreground"
                          >
                            {liveAds.text}
                          </pre>
                        </div>
                      )}
                    </>
                  )}

                  {formError && (
                    <div
                      className="border-l-2 border-destructive bg-destructive/5 px-4 py-3"
                      data-testid="text-form-error"
                    >
                      <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-destructive mb-1">
                        Fout
                      </p>
                      <p className="text-sm text-foreground font-['Inter']">
                        {formError}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-foreground/20">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      data-testid="button-save-client"
                      className="py-3 px-5 bg-accent text-accent-foreground border-2 border-accent font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-[4px_4px_0px_hsl(var(--foreground))] hover:bg-accent/90 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {editing === "new"
                        ? "Dossier aanmaken"
                        : "Wijzigingen opslaan"}
                    </button>

                    <button
                      onClick={closeEditor}
                      disabled={saving}
                      data-testid="button-cancel"
                      className="py-3 px-5 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    >
                      Annuleren
                    </button>

                    {typeof editing === "number" && (
                      <div className="ml-auto flex items-center gap-3">
                        {confirmDelete ? (
                          <>
                            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                              Definitief?
                            </span>
                            <button
                              onClick={handleDelete}
                              disabled={deleting}
                              data-testid="button-confirm-delete"
                              className="py-2.5 px-4 bg-destructive text-destructive-foreground border-2 border-destructive font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 shadow-[4px_4px_0px_hsl(var(--foreground))] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:pointer-events-none"
                            >
                              {deleting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                              Verwijderen
                            </button>
                            <button
                              onClick={() => setConfirmDelete(false)}
                              disabled={deleting}
                              className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                            >
                              Behouden
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(true)}
                            data-testid="button-delete-client"
                            className="py-2.5 px-4 border-2 border-destructive text-destructive font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            Verwijderen
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
