import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetClients,
  useCreateClient,
  useUpdateClient,
  useDeleteClient,
  useClientWebsiteIntake,
  useClientGoogleAdsRefresh,
  useClientCompetitorAdsRefresh,
  useClientSearchConsoleRefresh,
  useClientBingRefresh,
  useClientGa4Refresh,
  useClientPlacesRefresh,
  useClientPagespeedRefresh,
  useClientBusinessProfileRefresh,
  useClientBriefingSuggest,
  useGetClientGroups,
  useCreateClientGroup,
  getGetClientsQueryKey,
  getGetClientGroupsQueryKey,
  getGetDocGraphQueryKey,
  type Client,
  type ClientInput,
  type BriefingSuggestions,
} from "@workspace/api-client-react";
import {
  Activity,
  BarChart3,
  Building2,
  Euro,
  FileDown,
  Receipt,
  Gauge,
  Globe,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Reveal from "@/components/Reveal";
import ClientToolbox from "@/components/ClientToolbox";
import GroupFeeEditor from "@/components/GroupFeeEditor";
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
  // Klantgroep ("kapstok") of the open fiche — numeric and kept outside the
  // string-only FormState. null = ungrouped.
  const [groupId, setGroupId] = useState<number | null>(null);
  // Maandelijkse fee (hele euro's) — numeriek, dus net als groupId buiten de
  // string-only FormState gehouden en apart in de save-payload gemengd.
  const [monthlyFee, setMonthlyFee] = useState<number | null>(null);
  // Inline "nieuwe klantgroep" composer in the editor selector.
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  // Which group's overview panel is open in the register (null = none).
  const [openGroupOverview, setOpenGroupOverview] = useState<number | null>(
    null,
  );
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
  // Live competitor ads (Ads Transparency Center) — set by the
  // competitor-ads-refresh endpoint; the advertiser list is an editable field.
  const [liveCompetitors, setLiveCompetitors] = useState<{
    text: string | null;
    at: string | null;
  }>({ text: null, at: null });
  // Live Search Console (fase 4) — set by the search-console-refresh endpoint;
  // the property URL is an editable field.
  const [liveSearchConsole, setLiveSearchConsole] = useState<{
    text: string | null;
    at: string | null;
  }>({ text: null, at: null });
  // Live Bing Webmaster — set by the bing-refresh endpoint; the verified site
  // URL is an editable field. Bing's BE/NL share is small, so this is a
  // supplementary organic-search source next to Search Console.
  const [liveBing, setLiveBing] = useState<{
    text: string | null;
    at: string | null;
  }>({ text: null, at: null });
  // Live GA4 analytics (fase 4) — set by the ga4-refresh endpoint; the property
  // id is an editable field.
  const [liveGa4, setLiveGa4] = useState<{
    text: string | null;
    at: string | null;
  }>({ text: null, at: null });
  // Live Google Maps / Places (fase 4) — set by the places-refresh endpoint; the
  // own-listing query + competitor queries are editable fields.
  const [livePlaces, setLivePlaces] = useState<{
    text: string | null;
    at: string | null;
  }>({ text: null, at: null });
  // Live PageSpeed Insights (fase 4) — set by the pagespeed-refresh endpoint; the
  // landing-page URL list is an editable field.
  const [livePagespeed, setLivePagespeed] = useState<{
    text: string | null;
    at: string | null;
  }>({ text: null, at: null });
  // Live Google Business Profile (fase 4) — set by the business-profile-refresh
  // endpoint; the location id is an editable field.
  const [liveBusinessProfile, setLiveBusinessProfile] = useState<{
    text: string | null;
    at: string | null;
  }>({ text: null, at: null });
  // Optimistic concurrency: the `updatedAt` of the row as it was loaded into the
  // editor. We echo it back on save so the server can reject (409) if someone
  // else changed the fiche in the meantime, instead of silently overwriting.
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string | null>(null);

  // One-page Google Ads snapshot PDF (deterministic, server-rendered).
  const [snapshotting, setSnapshotting] = useState(false);
  const [factuurPreviewing, setFactuurPreviewing] = useState(false);
  const [issuingInvoice, setIssuingInvoice] = useState(false);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [offerteProse, setOfferteProse] = useState("");
  const [offerteLines, setOfferteLines] = useState<
    { label: string; amountEur: string; recurrence: "eenmalig" | "maandelijks" }[]
  >([
    {
      label: "Beheer Google Ads — maandelijkse vergoeding",
      amountEur: "",
      recurrence: "maandelijks",
    },
  ]);
  const [offerteValidUntil, setOfferteValidUntil] = useState("");
  const [offerteGenerating, setOfferteGenerating] = useState(false);
  // AI briefing suggestions (proposal only — never auto-saved). The user reviews
  // each value and applies it into the form before saving.
  const [briefingSuggestions, setBriefingSuggestions] =
    useState<BriefingSuggestions | null>(null);
  const [briefingNotes, setBriefingNotes] = useState<string>("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
    // The doc graph merges DB clients, so refresh it too — the new/updated
    // client must surface in the Kaart command bar and the Kaart graph.
    queryClient.invalidateQueries({ queryKey: getGetDocGraphQueryKey() });
    // Member counts on the klantgroep "kapstok" shift whenever a fiche is
    // (re)assigned, so refresh the group index too.
    queryClient.invalidateQueries({ queryKey: getGetClientGroupsQueryKey() });
  };

  const { data: groupsData } = useGetClientGroups();
  const groups = useMemo(() => groupsData?.groups ?? [], [groupsData]);
  const groupCreateMut = useCreateClientGroup();

  // Build the register sections: one block per klantgroep (kapstok) that has
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

  const createMut = useCreateClient();
  const updateMut = useUpdateClient();
  const deleteMut = useDeleteClient();
  const intakeMut = useClientWebsiteIntake();
  const adsMut = useClientGoogleAdsRefresh();
  const competMut = useClientCompetitorAdsRefresh();
  const scMut = useClientSearchConsoleRefresh();
  const bingMut = useClientBingRefresh();
  const ga4Mut = useClientGa4Refresh();
  const placesMut = useClientPlacesRefresh();
  const pagespeedMut = useClientPagespeedRefresh();
  const businessProfileMut = useClientBusinessProfileRefresh();
  const briefingMut = useClientBriefingSuggest();

  const saving = createMut.isPending || updateMut.isPending;
  const deleting = deleteMut.isPending;
  const intaking = intakeMut.isPending;
  const refreshingAds = adsMut.isPending;
  const refreshingCompetitors = competMut.isPending;
  const refreshingSearchConsole = scMut.isPending;
  const refreshingBing = bingMut.isPending;
  const refreshingGa4 = ga4Mut.isPending;
  const refreshingPlaces = placesMut.isPending;
  const refreshingPagespeed = pagespeedMut.isPending;
  const refreshingBusinessProfile = businessProfileMut.isPending;
  const suggestingBriefing = briefingMut.isPending;

  const clearBriefingSuggestions = () => {
    setBriefingSuggestions(null);
    setBriefingNotes("");
  };

  const resetOfferte = () => {
    setOfferteProse("");
    setOfferteLines([
      {
        label: "Beheer Google Ads — maandelijkse vergoeding",
        amountEur: "",
        recurrence: "maandelijks",
      },
    ]);
    setOfferteValidUntil("");
  };

  const startCreate = () => {
    setEditing("new");
    setForm(EMPTY_FORM);
    setGroupId(null);
    setMonthlyFee(null);
    setNewGroupName("");
    setFormError(null);
    setConfirmDelete(false);
    setConfirmIssue(false);
    clearBriefingSuggestions();
    setIntake({ text: null, at: null });
    setLiveAds({ text: null, at: null });
    setLiveCompetitors({ text: null, at: null });
    setLiveSearchConsole({ text: null, at: null });
    setLiveBing({ text: null, at: null });
    setLiveGa4({ text: null, at: null });
    setLivePlaces({ text: null, at: null });
    setLivePagespeed({ text: null, at: null });
    setLiveBusinessProfile({ text: null, at: null });
    setEditingUpdatedAt(null);
    resetOfferte();
  };

  const startEdit = (c: Client) => {
    setEditing(c.id);
    setForm(clientToForm(c));
    setGroupId(c.groupId ?? null);
    setMonthlyFee(c.monthlyFee ?? null);
    setNewGroupName("");
    setFormError(null);
    setConfirmDelete(false);
    setConfirmIssue(false);
    setIntake({ text: c.websiteIntake ?? null, at: c.websiteIntakeAt ?? null });
    setLiveAds({
      text: c.googleAdsLive ?? null,
      at: c.googleAdsLiveAt ?? null,
    });
    setLiveCompetitors({
      text: c.competitorAdsLive ?? null,
      at: c.competitorAdsLiveAt ?? null,
    });
    setLiveSearchConsole({
      text: c.searchConsoleLive ?? null,
      at: c.searchConsoleLiveAt ?? null,
    });
    setLiveBing({
      text: c.bingLive ?? null,
      at: c.bingLiveAt ?? null,
    });
    setLiveGa4({
      text: c.ga4Live ?? null,
      at: c.ga4LiveAt ?? null,
    });
    setLivePlaces({
      text: c.placesLive ?? null,
      at: c.placesLiveAt ?? null,
    });
    setLivePagespeed({
      text: c.pagespeedLive ?? null,
      at: c.pagespeedLiveAt ?? null,
    });
    setLiveBusinessProfile({
      text: c.businessProfileLive ?? null,
      at: c.businessProfileLiveAt ?? null,
    });
    setEditingUpdatedAt(c.updatedAt);
    clearBriefingSuggestions();
    resetOfferte();
  };

  const closeEditor = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setGroupId(null);
    setMonthlyFee(null);
    setNewGroupName("");
    setFormError(null);
    setConfirmDelete(false);
    setConfirmIssue(false);
    clearBriefingSuggestions();
    setIntake({ text: null, at: null });
    setLiveAds({ text: null, at: null });
    setLiveCompetitors({ text: null, at: null });
    setLiveSearchConsole({ text: null, at: null });
    setLiveBing({ text: null, at: null });
    setLiveGa4({ text: null, at: null });
    setLivePlaces({ text: null, at: null });
    setLivePagespeed({ text: null, at: null });
    setLiveBusinessProfile({ text: null, at: null });
    setEditingUpdatedAt(null);
    resetOfferte();
  };

  const setField = (key: keyof ClientInput, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Create a klantgroep inline from the editor selector and assign the open
  // fiche to it immediately (without persisting the whole fiche yet).
  const handleCreateGroup = () => {
    const name = newGroupName.trim();
    if (!name || creatingGroup) return;
    setCreatingGroup(true);
    groupCreateMut.mutate(
      { data: { name } },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({
            queryKey: getGetClientGroupsQueryKey(),
          });
          setGroupId(created.id);
          setNewGroupName("");
          setCreatingGroup(false);
        },
        onError: (err) => {
          setFormError(
            err instanceof Error ? err.message : "Klantgroep aanmaken mislukt",
          );
          setCreatingGroup(false);
        },
      },
    );
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      setFormError("Geef de cliënt minstens een naam.");
      return;
    }
    setFormError(null);
    const payload = { ...formToInput(form), groupId, monthlyFee };

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
            setGroupId(created.groupId ?? null);
            setMonthlyFee(created.monthlyFee ?? null);
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
            setGroupId(updated.groupId ?? null);
            setMonthlyFee(updated.monthlyFee ?? null);
            setEditingUpdatedAt(updated.updatedAt);
          },
          onError: (err) => {
            // 409: someone else changed the fiche first. Refresh the editor
            // with the current row so the user can re-apply their change.
            const conflict = asConflict(err);
            if (conflict) {
              invalidate();
              setForm(clientToForm(conflict));
              setGroupId(conflict.groupId ?? null);
              setMonthlyFee(conflict.monthlyFee ?? null);
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

  const handleSnapshot = async () => {
    if (typeof editing !== "number") return;
    setFormError(null);
    setSnapshotting(true);
    try {
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/clients/${editing}/snapshot.pdf`,
        { credentials: "include" },
      );
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          msg = j.error || j.detail || msg;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug =
        (form.name || "klant")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || "klant";
      a.download = `snapshot-${slug}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Snapshot opstellen mislukt",
      );
    } finally {
      setSnapshotting(false);
    }
  };

  // Effectief factureerbare maandfee: klant-fiche heeft voorrang op de groep.
  const effectiveFee =
    monthlyFee ??
    (groupId != null
      ? (groups.find((g) => g.id === groupId)?.monthlyFee ?? null)
      : null);

  const offerteHasValidLine = offerteLines.some(
    (l) =>
      l.label.trim() !== "" &&
      l.amountEur.trim() !== "" &&
      Number.isFinite(Number(l.amountEur)) &&
      Number(l.amountEur) >= 0,
  );

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const errorFromResponse = async (res: Response): Promise<string> => {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.error || j.detail || msg;
    } catch {
      /* non-JSON error body */
    }
    return msg;
  };

  // Proforma-preview: opent een PDF zonder een factuurnummer te verbruiken.
  const handleFactuurPreview = async () => {
    if (typeof editing !== "number") return;
    setFormError(null);
    setFactuurPreviewing(true);
    try {
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/clients/${editing}/factuur-preview.pdf`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(await errorFromResponse(res));
      const blob = await res.blob();
      const slug =
        (form.name || "klant")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || "klant";
      triggerDownload(blob, `proforma-${slug}.pdf`);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Proforma opstellen mislukt",
      );
    } finally {
      setFactuurPreviewing(false);
    }
  };

  // Definitieve factuur uitgeven: kent een sluitend nummer toe en bewaart de rij.
  const handleIssueInvoice = async () => {
    if (typeof editing !== "number") return;
    setFormError(null);
    setIssuingInvoice(true);
    try {
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/clients/${editing}/invoices`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) throw new Error(await errorFromResponse(res));
      const number = res.headers.get("X-Invoice-Number") || "";
      const blob = await res.blob();
      triggerDownload(blob, number ? `factuur-${number}.pdf` : "factuur.pdf");
      setConfirmIssue(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Factuur uitgeven mislukt",
      );
    } finally {
      setIssuingInvoice(false);
    }
  };

  // --- Offerte (hybride: AI-tekst + handmatige prijzen) -------------------
  const updateOfferteLine = (
    i: number,
    patch: Partial<{
      label: string;
      amountEur: string;
      recurrence: "eenmalig" | "maandelijks";
    }>,
  ) =>
    setOfferteLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );

  const addOfferteLine = () =>
    setOfferteLines((prev) =>
      prev.length >= 25
        ? prev
        : [...prev, { label: "", amountEur: "", recurrence: "maandelijks" }],
    );

  const removeOfferteLine = (i: number) =>
    setOfferteLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i),
    );

  const handleOfferte = async () => {
    if (typeof editing !== "number") return;
    setFormError(null);
    const lines = offerteLines
      .filter(
        (l) =>
          l.label.trim() !== "" &&
          l.amountEur.trim() !== "" &&
          Number.isFinite(Number(l.amountEur)) &&
          Number(l.amountEur) >= 0,
      )
      .map((l) => ({
        label: l.label.trim(),
        amountEur: Number(l.amountEur),
        recurrence: l.recurrence,
      }));
    if (lines.length === 0) {
      setFormError(
        "Voeg minstens één geldige prijsregel toe (omschrijving + bedrag).",
      );
      return;
    }
    setOfferteGenerating(true);
    try {
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/clients/${editing}/offerte.pdf`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proseMarkdown: offerteProse,
            lines,
            validUntilLabel: offerteValidUntil.trim() || undefined,
          }),
        },
      );
      if (!res.ok) throw new Error(await errorFromResponse(res));
      const blob = await res.blob();
      const slug =
        (form.name || "klant")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || "klant";
      triggerDownload(blob, `offerte-${slug}.pdf`);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Offerte opstellen mislukt",
      );
    } finally {
      setOfferteGenerating(false);
    }
  };

  const handleCompetitorAds = () => {
    if (typeof editing !== "number") return;
    setFormError(null);
    competMut.mutate(
      { id: editing },
      {
        onSuccess: (updated) => {
          invalidate();
          setForm(clientToForm(updated));
          setLiveCompetitors({
            text: updated.competitorAdsLive ?? null,
            at: updated.competitorAdsLiveAt ?? null,
          });
        },
        onError: (err) =>
          setFormError(
            err instanceof Error
              ? err.message
              : "Concurrent-advertenties ophalen mislukt",
          ),
      },
    );
  };

  const handleSearchConsole = () => {
    if (typeof editing !== "number") return;
    setFormError(null);
    scMut.mutate(
      { id: editing },
      {
        onSuccess: (updated) => {
          invalidate();
          setForm(clientToForm(updated));
          setLiveSearchConsole({
            text: updated.searchConsoleLive ?? null,
            at: updated.searchConsoleLiveAt ?? null,
          });
        },
        onError: (err) =>
          setFormError(
            err instanceof Error
              ? err.message
              : "Search Console ophalen mislukt",
          ),
      },
    );
  };

  const handleBing = () => {
    if (typeof editing !== "number") return;
    setFormError(null);
    bingMut.mutate(
      { id: editing },
      {
        onSuccess: (updated) => {
          invalidate();
          setForm(clientToForm(updated));
          setLiveBing({
            text: updated.bingLive ?? null,
            at: updated.bingLiveAt ?? null,
          });
        },
        onError: (err) =>
          setFormError(
            err instanceof Error
              ? err.message
              : "Bing Webmaster ophalen mislukt",
          ),
      },
    );
  };

  const handleGa4 = () => {
    if (typeof editing !== "number") return;
    setFormError(null);
    ga4Mut.mutate(
      { id: editing },
      {
        onSuccess: (updated) => {
          invalidate();
          setForm(clientToForm(updated));
          setLiveGa4({
            text: updated.ga4Live ?? null,
            at: updated.ga4LiveAt ?? null,
          });
        },
        onError: (err) =>
          setFormError(
            err instanceof Error ? err.message : "GA4 ophalen mislukt",
          ),
      },
    );
  };

  const handlePlaces = () => {
    if (typeof editing !== "number") return;
    setFormError(null);
    placesMut.mutate(
      { id: editing },
      {
        onSuccess: (updated) => {
          invalidate();
          setForm(clientToForm(updated));
          setLivePlaces({
            text: updated.placesLive ?? null,
            at: updated.placesLiveAt ?? null,
          });
        },
        onError: (err) =>
          setFormError(
            err instanceof Error ? err.message : "Google Maps ophalen mislukt",
          ),
      },
    );
  };

  const handlePagespeed = () => {
    if (typeof editing !== "number") return;
    setFormError(null);
    pagespeedMut.mutate(
      { id: editing },
      {
        onSuccess: (updated) => {
          invalidate();
          setForm(clientToForm(updated));
          setLivePagespeed({
            text: updated.pagespeedLive ?? null,
            at: updated.pagespeedLiveAt ?? null,
          });
        },
        onError: (err) =>
          setFormError(
            err instanceof Error
              ? err.message
              : "PageSpeed ophalen mislukt",
          ),
      },
    );
  };

  const handleBriefingSuggest = () => {
    if (typeof editing !== "number") return;
    setFormError(null);
    clearBriefingSuggestions();
    briefingMut.mutate(
      { id: editing },
      {
        onSuccess: (result) => {
          invalidate();
          // The endpoint may have cached the website-intake; reflect it.
          setIntake({
            text: result.client.websiteIntake ?? null,
            at: result.client.websiteIntakeAt ?? null,
          });
          setBriefingSuggestions(result.suggestions);
          setBriefingNotes(result.notes ?? "");
        },
        onError: (err) =>
          setFormError(
            err instanceof Error
              ? err.message
              : "Briefing voorstellen mislukt",
          ),
      },
    );
  };

  // Apply a single proposed value into the form (user still saves manually).
  const applySuggestion = (key: keyof BriefingSuggestions) => {
    const value = briefingSuggestions?.[key];
    if (typeof value !== "string") return;
    setField(key as keyof ClientInput, value);
  };

  // Apply every proposed value into the form at once.
  const applyAllSuggestions = () => {
    if (!briefingSuggestions) return;
    setForm((prev) => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(briefingSuggestions)) {
        if (typeof value === "string" && value.trim()) {
          next[key as keyof FormState] = value;
        }
      }
      return next;
    });
  };

  const handleBusinessProfile = () => {
    if (typeof editing !== "number") return;
    setFormError(null);
    businessProfileMut.mutate(
      { id: editing },
      {
        onSuccess: (updated) => {
          invalidate();
          setForm(clientToForm(updated));
          setLiveBusinessProfile({
            text: updated.businessProfileLive ?? null,
            at: updated.businessProfileLiveAt ?? null,
          });
        },
        onError: (err) =>
          setFormError(
            err instanceof Error
              ? err.message
              : "Business Profile ophalen mislukt",
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

        <ClientToolbox clients={clients} onChanged={invalidate} />

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
                  {/* Klantgroep (kapstok) — overkoepelend dossier */}
                  <div className="flex flex-col gap-2 border border-foreground/30 bg-foreground/5 p-4">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-accent" />
                      <label
                        htmlFor="client-group-select"
                        className="font-['Space_Mono'] text-[10px] uppercase tracking-widest"
                      >
                        Klantgroep (kapstok)
                      </label>
                    </div>
                    <p className="font-['Inter'] text-xs text-muted-foreground">
                      Bundel meerdere website-fiches onder één overkoepelend
                      dossier. Elke fiche houdt haar eigen gegevens.
                    </p>
                    <select
                      id="client-group-select"
                      data-testid="select-client-group"
                      value={groupId ?? ""}
                      onChange={(e) =>
                        setGroupId(
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                      className={`${INPUT_CLASS} w-full`}
                    >
                      <option value="">Zonder groep</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCreateGroup();
                          }
                        }}
                        placeholder="Nieuwe klantgroep..."
                        data-testid="input-new-group"
                        className={`${INPUT_CLASS} flex-1`}
                      />
                      <button
                        type="button"
                        onClick={handleCreateGroup}
                        disabled={!newGroupName.trim() || creatingGroup}
                        data-testid="button-create-group"
                        className="py-2 px-3 border border-foreground font-['Space_Mono'] text-[10px] uppercase tracking-widest flex items-center gap-1.5 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none shrink-0"
                      >
                        {creatingGroup ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        Maak
                      </button>
                    </div>
                  </div>

                  {/* Maandelijkse fee — voedt het omzet-overzicht op het dashboard */}
                  <div className="flex flex-col gap-2 border border-foreground/30 bg-foreground/5 p-4">
                    <div className="flex items-center gap-2">
                      <Euro className="w-4 h-4 text-accent" />
                      <label
                        htmlFor="client-monthly-fee"
                        className="font-['Space_Mono'] text-[10px] uppercase tracking-widest"
                      >
                        Maandelijkse fee
                      </label>
                    </div>
                    <p className="font-['Inter'] text-xs text-muted-foreground">
                      Brutobedrag per maand dat deze klant oplevert. Voedt het
                      omzet-overzicht op het dashboard.
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="font-['Playfair_Display'] font-black text-lg text-muted-foreground">
                        €
                      </span>
                      <input
                        id="client-monthly-fee"
                        type="number"
                        min={0}
                        step={50}
                        inputMode="numeric"
                        value={monthlyFee ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") {
                            setMonthlyFee(null);
                            return;
                          }
                          const n = Math.round(Number(v));
                          setMonthlyFee(
                            Number.isFinite(n) ? Math.max(0, n) : null,
                          );
                        }}
                        placeholder="0"
                        data-testid="input-monthly-fee"
                        className={`${INPUT_CLASS} w-40`}
                      />
                      <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground">
                        / maand
                      </span>
                    </div>
                  </div>

                  {/* Section heading */}
                  <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                    <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                      I. Briefing
                    </h3>
                    <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                      {FIELDS.length + STATE_FIELDS.length + 1} velden
                    </span>
                  </div>

                  {/* AI briefing-suggest — proposal only, existing clients */}
                  {typeof editing === "number" && (
                    <div className="-mt-4 flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleBriefingSuggest}
                          disabled={suggestingBriefing || !form.website.trim()}
                          data-testid="button-briefing-suggest"
                          className="py-2.5 px-4 border-2 border-accent text-accent font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-accent hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {suggestingBriefing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4" />
                          )}
                          {suggestingBriefing
                            ? "AI leest de website..."
                            : "Briefing automatisch voorstellen"}
                        </button>
                        {!form.website.trim() && (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul eerst het veld Website in (en bewaar)
                          </span>
                        )}
                      </div>

                      {briefingSuggestions &&
                        (() => {
                          const entries = (
                            Object.entries(briefingSuggestions) as [
                              keyof BriefingSuggestions,
                              string,
                            ][]
                          ).filter(([, v]) => typeof v === "string" && v.trim());
                          const labelOf = (k: string) =>
                            FIELDS.find((f) => f.key === k)?.label ?? k;
                          return (
                            <div className="border-2 border-accent bg-accent/5 p-4 flex flex-col gap-3">
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-accent">
                                  AI-voorstel · controleer & bevestig
                                </span>
                                <div className="flex items-center gap-2">
                                  {entries.length > 0 && (
                                    <button
                                      onClick={applyAllSuggestions}
                                      data-testid="button-apply-all-suggestions"
                                      className="py-1 px-2 border border-accent text-accent font-['Space_Mono'] text-[9px] uppercase tracking-widest hover:bg-accent hover:text-background transition-colors"
                                    >
                                      Alles overnemen
                                    </button>
                                  )}
                                  <button
                                    onClick={clearBriefingSuggestions}
                                    data-testid="button-dismiss-suggestions"
                                    className="p-1 border border-foreground/30 text-muted-foreground hover:bg-foreground hover:text-background transition-colors"
                                    aria-label="Voorstel sluiten"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              {briefingNotes.trim() && (
                                <p className="font-['Inter'] text-xs text-muted-foreground italic">
                                  {briefingNotes.trim()}
                                </p>
                              )}

                              {entries.length === 0 ? (
                                <p className="font-['Inter'] text-sm text-muted-foreground">
                                  Geen voorstellen — er was te weinig bruikbare
                                  info op de website.
                                </p>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  {entries.map(([key, value]) => (
                                    <div
                                      key={key}
                                      className="flex flex-col gap-1 border-b border-foreground/15 pb-2 last:border-b-0"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-foreground">
                                          {labelOf(key)}
                                        </span>
                                        <button
                                          onClick={() => applySuggestion(key)}
                                          data-testid={`button-apply-suggestion-${key}`}
                                          className="shrink-0 py-1 px-2 border border-foreground/40 text-foreground font-['Space_Mono'] text-[9px] uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"
                                        >
                                          Overnemen
                                        </button>
                                      </div>
                                      <p className="font-['Inter'] text-sm text-muted-foreground whitespace-pre-wrap">
                                        {value}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                    </div>
                  )}

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
                    Korte vrije notities over de echte stand van zaken voor deze
                    cliënt. Google Ads- en Search Console-cijfers hoef je hier niet
                    meer te plakken — die worden nu live opgehaald (zie de
                    live-integraties hieronder).
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
                        <button
                          onClick={handleSnapshot}
                          disabled={
                            snapshotting || !form.googleAdsCustomerId.trim()
                          }
                          data-testid="button-snapshot-pdf"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {snapshotting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <FileDown className="w-4 h-4" />
                          )}
                          Snapshot (PDF)
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

                  {/* Section V — live competitor ads (existing clients only) */}
                  {typeof editing === "number" && (
                    <>
                      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                          V. Concurrent-advertenties
                        </h3>
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          Ads Transparency Center
                        </span>
                      </div>

                      <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                        Haalt de actieve advertenties van concurrenten op uit het
                        publieke Google Ads Transparency Center: aantal, formaten
                        en looptijden. Alleen-lezen. De data wordt bewaard en
                        meegegeven aan de agents als marktcontext.
                      </p>

                      <div className="flex flex-col gap-1.5">
                        <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                          Concurrenten
                        </label>
                        <Textarea
                          value={form.competitorAdvertisers}
                          onChange={(e) =>
                            setField("competitorAdvertisers", e.target.value)
                          }
                          placeholder={
                            "Eén per regel: een advertiser-ID (bv. AR17828074650563772417)\nof een domein/zoekterm (bv. concurrent.be)"
                          }
                          rows={4}
                          data-testid="input-client-competitorAdvertisers"
                          className={INPUT_CLASS}
                        />
                        <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                          Bewaar de lijst eerst met "Wijzigingen opslaan" voor je
                          ophaalt.
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleCompetitorAds}
                          disabled={
                            refreshingCompetitors ||
                            !form.competitorAdvertisers.trim()
                          }
                          data-testid="button-competitor-ads-refresh"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {refreshingCompetitors ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Users className="w-4 h-4" />
                          )}
                          {liveCompetitors.text
                            ? "Opnieuw ophalen"
                            : "Concurrenten ophalen"}
                        </button>
                        {!form.competitorAdvertisers.trim() ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul eerst minstens één concurrent in
                          </span>
                        ) : liveCompetitors.at ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground">
                            Laatst opgehaald:{" "}
                            {new Date(liveCompetitors.at).toLocaleString(
                              "nl-BE",
                              { dateStyle: "medium", timeStyle: "short" },
                            )}
                          </span>
                        ) : (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Nog niet opgehaald
                          </span>
                        )}
                      </div>

                      {liveCompetitors.text && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-baseline justify-between border-b border-foreground/20 pb-1">
                            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                              Opgehaalde data
                            </span>
                            <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                              {liveCompetitors.text.length.toLocaleString(
                                "nl-BE",
                              )}{" "}
                              tekens
                            </span>
                          </div>
                          <pre
                            data-testid="text-competitor-ads-live"
                            className="max-h-72 overflow-auto whitespace-pre-wrap break-words border border-foreground/30 bg-background p-3 font-['Space_Mono'] text-[11px] leading-relaxed text-muted-foreground"
                          >
                            {liveCompetitors.text}
                          </pre>
                        </div>
                      )}
                    </>
                  )}

                  {/* Section VI — live Search Console (existing clients only) */}
                  {typeof editing === "number" && (
                    <>
                      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                          VI. Live Search Console
                        </h3>
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          Organisch zoekverkeer
                        </span>
                      </div>

                      <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                        Haalt live cijfers op uit Google Search Console (laatste 28
                        dagen): klikken, impressies, CTR en gemiddelde positie, plus
                        top-queries en kansen ("striking distance"). Alleen-lezen. De
                        data wordt bewaard en meegegeven aan de agents als SEO-context.
                      </p>

                      <div className="flex flex-col gap-1.5">
                        <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                          Search Console-property
                        </label>
                        <Input
                          value={form.searchConsoleSiteUrl}
                          onChange={(e) =>
                            setField("searchConsoleSiteUrl", e.target.value)
                          }
                          placeholder="Bv. sc-domain:voorbeeld.be of https://voorbeeld.be/"
                          data-testid="input-client-searchConsoleSiteUrl"
                          className={INPUT_CLASS}
                        />
                        <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                          Bewaar de property eerst met "Wijzigingen opslaan" voor je
                          ophaalt.
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleSearchConsole}
                          disabled={
                            refreshingSearchConsole ||
                            !form.searchConsoleSiteUrl.trim()
                          }
                          data-testid="button-search-console-refresh"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {refreshingSearchConsole ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Search className="w-4 h-4" />
                          )}
                          {liveSearchConsole.text
                            ? "Opnieuw ophalen"
                            : "Search Console ophalen"}
                        </button>
                        {!form.searchConsoleSiteUrl.trim() ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul eerst de property in
                          </span>
                        ) : liveSearchConsole.at ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground">
                            Laatst opgehaald:{" "}
                            {new Date(liveSearchConsole.at).toLocaleString(
                              "nl-BE",
                              { dateStyle: "medium", timeStyle: "short" },
                            )}
                          </span>
                        ) : (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Nog niet opgehaald
                          </span>
                        )}
                      </div>

                      {liveSearchConsole.text && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-baseline justify-between border-b border-foreground/20 pb-1">
                            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                              Opgehaalde data
                            </span>
                            <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                              {liveSearchConsole.text.length.toLocaleString(
                                "nl-BE",
                              )}{" "}
                              tekens
                            </span>
                          </div>
                          <pre
                            data-testid="text-search-console-live"
                            className="max-h-72 overflow-auto whitespace-pre-wrap break-words border border-foreground/30 bg-background p-3 font-['Space_Mono'] text-[11px] leading-relaxed text-muted-foreground"
                          >
                            {liveSearchConsole.text}
                          </pre>
                        </div>
                      )}
                    </>
                  )}

                  {/* Section VII — live Bing Webmaster (existing clients only) */}
                  {typeof editing === "number" && (
                    <>
                      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                          VII. Live Bing Webmaster
                        </h3>
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          Organisch zoekverkeer (Bing)
                        </span>
                      </div>

                      <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                        Haalt live cijfers op uit Bing Webmaster Tools (recentste
                        ~4 weken): klikken, impressies, CTR en gemiddelde positie,
                        plus top-zoektermen en -pagina's. Alleen-lezen. Let op: Bing
                        heeft een klein marktaandeel in BE/NL — gebruik dit als
                        aanvulling op Search Console, niet als hoofdbron.
                      </p>

                      <div className="flex flex-col gap-1.5">
                        <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                          Bing Webmaster-site
                        </label>
                        <Input
                          value={form.bingSiteUrl}
                          onChange={(e) =>
                            setField("bingSiteUrl", e.target.value)
                          }
                          placeholder="Bv. https://voorbeeld.be/"
                          data-testid="input-client-bingSiteUrl"
                          className={INPUT_CLASS}
                        />
                        <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                          De volledige URL van de in Bing geverifieerde site.
                          Bewaar eerst met "Wijzigingen opslaan" voor je ophaalt.
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleBing}
                          disabled={refreshingBing || !form.bingSiteUrl.trim()}
                          data-testid="button-bing-refresh"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {refreshingBing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Globe className="w-4 h-4" />
                          )}
                          {liveBing.text ? "Opnieuw ophalen" : "Bing ophalen"}
                        </button>
                        {!form.bingSiteUrl.trim() ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul eerst de site-URL in
                          </span>
                        ) : liveBing.at ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground">
                            Laatst opgehaald:{" "}
                            {new Date(liveBing.at).toLocaleString("nl-BE", {
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

                      {liveBing.text && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-baseline justify-between border-b border-foreground/20 pb-1">
                            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                              Opgehaalde data
                            </span>
                            <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                              {liveBing.text.length.toLocaleString("nl-BE")}{" "}
                              tekens
                            </span>
                          </div>
                          <pre
                            data-testid="text-bing-live"
                            className="max-h-72 overflow-auto whitespace-pre-wrap break-words border border-foreground/30 bg-background p-3 font-['Space_Mono'] text-[11px] leading-relaxed text-muted-foreground"
                          >
                            {liveBing.text}
                          </pre>
                        </div>
                      )}
                    </>
                  )}

                  {/* Section VIII — live GA4 analytics (existing clients only) */}
                  {typeof editing === "number" && (
                    <>
                      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                          VIII. Live GA4
                        </h3>
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          Website-analytics
                        </span>
                      </div>

                      <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                        Haalt live cijfers op uit Google Analytics 4 (laatste 28
                        dagen): sessies, gebruikers, conversies en engagement, plus
                        top-kanalen en landingspagina's. Alleen-lezen. De data wordt
                        bewaard en meegegeven aan de agents als analytics-context.
                      </p>

                      <div className="flex flex-col gap-1.5">
                        <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                          GA4 property-id
                        </label>
                        <Input
                          value={form.ga4PropertyId}
                          onChange={(e) =>
                            setField("ga4PropertyId", e.target.value)
                          }
                          placeholder="Bv. 123456789"
                          data-testid="input-client-ga4PropertyId"
                          className={INPUT_CLASS}
                        />
                        <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                          Bewaar het property-id eerst met "Wijzigingen opslaan" voor
                          je ophaalt.
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleGa4}
                          disabled={
                            refreshingGa4 || !form.ga4PropertyId.trim()
                          }
                          data-testid="button-ga4-refresh"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {refreshingGa4 ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Activity className="w-4 h-4" />
                          )}
                          {liveGa4.text ? "Opnieuw ophalen" : "GA4 ophalen"}
                        </button>
                        {!form.ga4PropertyId.trim() ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul eerst het property-id in
                          </span>
                        ) : liveGa4.at ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground">
                            Laatst opgehaald:{" "}
                            {new Date(liveGa4.at).toLocaleString("nl-BE", {
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

                      {liveGa4.text && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-baseline justify-between border-b border-foreground/20 pb-1">
                            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                              Opgehaalde data
                            </span>
                            <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                              {liveGa4.text.length.toLocaleString("nl-BE")} tekens
                            </span>
                          </div>
                          <pre
                            data-testid="text-ga4-live"
                            className="max-h-72 overflow-auto whitespace-pre-wrap break-words border border-foreground/30 bg-background p-3 font-['Space_Mono'] text-[11px] leading-relaxed text-muted-foreground"
                          >
                            {liveGa4.text}
                          </pre>
                        </div>
                      )}
                    </>
                  )}

                  {/* Section IX — live Google Maps / Places (existing clients only) */}
                  {typeof editing === "number" && (
                    <>
                      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                          IX. Live Google Maps
                        </h3>
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          Lokale reputatie
                        </span>
                      </div>

                      <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                        Zoekt de Google-listing van de klant en die van opgegeven
                        concurrenten op: rating, aantal reviews, categorie en status.
                        Alleen-lezen. De data wordt bewaard en meegegeven aan de agents
                        als lokale-reputatie-context.
                      </p>

                      <div className="flex flex-col gap-1.5">
                        <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                          Eigen listing (naam + plaats)
                        </label>
                        <Input
                          value={form.placesQuery}
                          onChange={(e) => setField("placesQuery", e.target.value)}
                          placeholder='Bv. "Klant BV Gent"'
                          data-testid="input-client-placesQuery"
                          className={INPUT_CLASS}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                          Concurrenten (één per regel)
                        </label>
                        <Textarea
                          value={form.placesCompetitors}
                          onChange={(e) =>
                            setField("placesCompetitors", e.target.value)
                          }
                          placeholder={"Bv. Concurrent A Gent\nConcurrent B Gent"}
                          rows={3}
                          data-testid="input-client-placesCompetitors"
                          className={INPUT_CLASS}
                        />
                        <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                          Bewaar eerst met "Wijzigingen opslaan" voor je ophaalt.
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handlePlaces}
                          disabled={
                            refreshingPlaces || !form.placesQuery.trim()
                          }
                          data-testid="button-places-refresh"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {refreshingPlaces ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <MapPin className="w-4 h-4" />
                          )}
                          {livePlaces.text ? "Opnieuw ophalen" : "Google Maps ophalen"}
                        </button>
                        {!form.placesQuery.trim() ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul eerst de eigen listing in
                          </span>
                        ) : livePlaces.at ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground">
                            Laatst opgehaald:{" "}
                            {new Date(livePlaces.at).toLocaleString("nl-BE", {
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

                      {livePlaces.text && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-baseline justify-between border-b border-foreground/20 pb-1">
                            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                              Opgehaalde data
                            </span>
                            <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                              {livePlaces.text.length.toLocaleString("nl-BE")} tekens
                            </span>
                          </div>
                          <pre
                            data-testid="text-places-live"
                            className="max-h-72 overflow-auto whitespace-pre-wrap break-words border border-foreground/30 bg-background p-3 font-['Space_Mono'] text-[11px] leading-relaxed text-muted-foreground"
                          >
                            {livePlaces.text}
                          </pre>
                        </div>
                      )}
                    </>
                  )}

                  {/* Section X — live PageSpeed Insights (existing clients only) */}
                  {typeof editing === "number" && (
                    <>
                      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                          X. Live PageSpeed
                        </h3>
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          Snelheid landingspagina's
                        </span>
                      </div>

                      <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                        Meet de snelheid van de landingspagina's (mobiel) via Google
                        Lighthouse: performance-score en Core Web Vitals (LCP, CLS, TBT).
                        Alleen-lezen. Trage pagina's drukken de Quality Score en de
                        conversie; de data wordt meegegeven aan de agents.
                      </p>

                      <div className="flex flex-col gap-1.5">
                        <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                          Landingspagina's (één URL per regel)
                        </label>
                        <Textarea
                          value={form.pagespeedUrls}
                          onChange={(e) =>
                            setField("pagespeedUrls", e.target.value)
                          }
                          placeholder={
                            "Bv. https://klant.be/\nhttps://klant.be/diensten"
                          }
                          rows={3}
                          data-testid="input-client-pagespeedUrls"
                          className={INPUT_CLASS}
                        />
                        <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                          {form.pagespeedUrls.trim()
                            ? 'Bewaar eerst met "Wijzigingen opslaan" voor je ophaalt.'
                            : "Leeg = automatisch het Website-veld gebruiken. Bewaar eerst."}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handlePagespeed}
                          disabled={
                            refreshingPagespeed ||
                            (!form.pagespeedUrls.trim() && !form.website.trim())
                          }
                          data-testid="button-pagespeed-refresh"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {refreshingPagespeed ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Gauge className="w-4 h-4" />
                          )}
                          {livePagespeed.text
                            ? "Opnieuw meten"
                            : "PageSpeed meten"}
                        </button>
                        {!form.pagespeedUrls.trim() && !form.website.trim() ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul eerst een landingspagina of het Website-veld in
                          </span>
                        ) : livePagespeed.at ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground">
                            Laatst gemeten:{" "}
                            {new Date(livePagespeed.at).toLocaleString("nl-BE", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        ) : (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Nog niet gemeten
                          </span>
                        )}
                      </div>

                      {livePagespeed.text && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-baseline justify-between border-b border-foreground/20 pb-1">
                            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                              Gemeten data
                            </span>
                            <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                              {livePagespeed.text.length.toLocaleString("nl-BE")}{" "}
                              tekens
                            </span>
                          </div>
                          <pre
                            data-testid="text-pagespeed-live"
                            className="max-h-72 overflow-auto whitespace-pre-wrap break-words border border-foreground/30 bg-background p-3 font-['Space_Mono'] text-[11px] leading-relaxed text-muted-foreground"
                          >
                            {livePagespeed.text}
                          </pre>
                        </div>
                      )}
                    </>
                  )}

                  {/* Section XI — live Google Business Profile (existing clients only) */}
                  {typeof editing === "number" && (
                    <>
                      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                          XI. Live Business Profile
                        </h3>
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          Lokale aanwezigheid (GMB)
                        </span>
                      </div>

                      <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                        Haalt de lokale prestaties van de Google Business-listing op:
                        vertoningen op Maps en Zoeken, telefoonklikken, websiteklikken,
                        route-aanvragen en berichten (laatste ~30 dagen). Alleen-lezen.
                        De data wordt meegegeven aan de agents. Let op: deze API vereist
                        eerst goedkeuring (allowlist) van Google voor er live data komt.
                      </p>

                      <div className="flex flex-col gap-1.5">
                        <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                          Locatie-id
                        </label>
                        <Input
                          value={form.businessProfileLocationId}
                          onChange={(e) =>
                            setField("businessProfileLocationId", e.target.value)
                          }
                          placeholder='Bv. "locations/123456789" of het numerieke id'
                          data-testid="input-client-businessProfileLocationId"
                          className={INPUT_CLASS}
                        />
                        <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                          Bewaar eerst met "Wijzigingen opslaan" voor je ophaalt.
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleBusinessProfile}
                          disabled={
                            refreshingBusinessProfile ||
                            !form.businessProfileLocationId.trim()
                          }
                          data-testid="button-business-profile-refresh"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {refreshingBusinessProfile ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Building2 className="w-4 h-4" />
                          )}
                          {liveBusinessProfile.text
                            ? "Opnieuw ophalen"
                            : "Business Profile ophalen"}
                        </button>
                        {!form.businessProfileLocationId.trim() ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul eerst een locatie-id in
                          </span>
                        ) : liveBusinessProfile.at ? (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground">
                            Laatst opgehaald:{" "}
                            {new Date(liveBusinessProfile.at).toLocaleString(
                              "nl-BE",
                              { dateStyle: "medium", timeStyle: "short" },
                            )}
                          </span>
                        ) : (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Nog niet opgehaald
                          </span>
                        )}
                      </div>

                      {liveBusinessProfile.text && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-baseline justify-between border-b border-foreground/20 pb-1">
                            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                              Opgehaalde data
                            </span>
                            <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                              {liveBusinessProfile.text.length.toLocaleString(
                                "nl-BE",
                              )}{" "}
                              tekens
                            </span>
                          </div>
                          <pre
                            data-testid="text-business-profile-live"
                            className="max-h-72 overflow-auto whitespace-pre-wrap break-words border border-foreground/30 bg-background p-3 font-['Space_Mono'] text-[11px] leading-relaxed text-muted-foreground"
                          >
                            {liveBusinessProfile.text}
                          </pre>
                        </div>
                      )}
                    </>
                  )}

                  {/* Section XII — facturatie (existing clients only) */}
                  {typeof editing === "number" && (
                    <>
                      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                          XII. Facturatie
                        </h3>
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          Deterministisch — geen AI
                        </span>
                      </div>

                      <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                        Stelt een proforma of definitieve factuur op uit het
                        klantdossier en de maandelijkse fee. De proforma verbruikt
                        geen nummer; bij "Factuur uitgeven" wordt een sluitend
                        factuurnummer toegekend en bewaard.
                      </p>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                          <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                            Facturatienaam
                          </label>
                          <Input
                            value={form.billingName}
                            onChange={(e) =>
                              setField("billingName", e.target.value)
                            }
                            placeholder="Leeg = klantnaam wordt gebruikt"
                            data-testid="input-client-billingName"
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                          <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                            Facturatieadres
                          </label>
                          <Textarea
                            value={form.billingAddress}
                            onChange={(e) =>
                              setField("billingAddress", e.target.value)
                            }
                            placeholder={"Straat en nummer\nPostcode + gemeente"}
                            rows={3}
                            data-testid="input-client-billingAddress"
                            className={INPUT_CLASS}
                          />
                          <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                            Eén regel per adreslijn. Verplicht om te factureren.
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                            Land
                          </label>
                          <Input
                            value={form.billingCountry}
                            onChange={(e) =>
                              setField("billingCountry", e.target.value)
                            }
                            placeholder="België"
                            data-testid="input-client-billingCountry"
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                            Btw-nummer
                          </label>
                          <Input
                            value={form.vatNumber}
                            onChange={(e) =>
                              setField("vatNumber", e.target.value)
                            }
                            placeholder="BE 0123.456.789"
                            data-testid="input-client-vatNumber"
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                          <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                            Btw-modus
                          </label>
                          <select
                            value={form.btwMode}
                            onChange={(e) =>
                              setField("btwMode", e.target.value)
                            }
                            data-testid="select-client-btwMode"
                            className={`${INPUT_CLASS} w-full`}
                          >
                            <option value="">
                              Automatisch (afgeleid uit btw-nummer)
                            </option>
                            <option value="btw_21">Belgische btw — 21%</option>
                            <option value="verlegd">
                              Btw verlegd (intracommunautair B2B)
                            </option>
                          </select>
                          <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                            "Verlegd" vereist het btw-nummer van de klant.
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 border border-foreground/30 bg-foreground/5 p-3">
                        <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                          Factureerbare fee
                        </span>
                        {effectiveFee != null ? (
                          <span className="font-['Playfair_Display'] font-black text-lg">
                            € {effectiveFee.toLocaleString("nl-BE")} / maand
                            <span className="font-['Space_Mono'] text-[10px] font-normal uppercase tracking-wider text-muted-foreground ml-2">
                              {monthlyFee != null ? "klant-fiche" : "groep"}
                            </span>
                          </span>
                        ) : (
                          <span className="font-['Inter'] text-sm text-muted-foreground">
                            Nog geen fee ingesteld op de fiche of de groep.
                          </span>
                        )}
                      </div>

                      <p className="font-['Space_Mono'] text-[9px] leading-relaxed tracking-wider text-muted-foreground/60">
                        Let op: sinds 1 januari 2026 geldt in België de
                        verplichting tot gestructureerde e-facturatie (Peppol) voor
                        B2B. Deze PDF is een leesbare kopie, geen vervanging van de
                        Peppol-e-factuur.
                      </p>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleFactuurPreview}
                          disabled={
                            factuurPreviewing ||
                            effectiveFee == null ||
                            !form.billingAddress.trim()
                          }
                          data-testid="button-factuur-preview"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {factuurPreviewing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <FileDown className="w-4 h-4" />
                          )}
                          Proforma (PDF)
                        </button>

                        {confirmIssue ? (
                          <>
                            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                              Definitief uitgeven?
                            </span>
                            <button
                              onClick={handleIssueInvoice}
                              disabled={issuingInvoice}
                              data-testid="button-confirm-issue-invoice"
                              className="py-2.5 px-4 bg-accent text-accent-foreground border-2 border-accent font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 shadow-[4px_4px_0px_hsl(var(--foreground))] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:pointer-events-none"
                            >
                              {issuingInvoice ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Receipt className="w-4 h-4" />
                              )}
                              Bevestig & download
                            </button>
                            <button
                              onClick={() => setConfirmIssue(false)}
                              disabled={issuingInvoice}
                              data-testid="button-cancel-issue-invoice"
                              className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                            >
                              Annuleren
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmIssue(true)}
                            disabled={
                              effectiveFee == null || !form.billingAddress.trim()
                            }
                            data-testid="button-issue-invoice"
                            className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                          >
                            <Receipt className="w-4 h-4" />
                            Factuur uitgeven
                          </button>
                        )}

                        {(effectiveFee == null ||
                          !form.billingAddress.trim()) && (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul fee + facturatieadres in en bewaar eerst
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  {/* Section XIII — offerte (existing clients only) */}
                  {typeof editing === "number" && (
                    <>
                      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                          XIII. Offerte
                        </h3>
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          Hybride — AI-tekst + jouw prijzen
                        </span>
                      </div>

                      <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                        Stelt een vrijblijvende offerte op: plak de voorsteltekst
                        (bv. uit de sales-proposal generatie) en vul de
                        prijsregels in. Geen factuurnummer, geen
                        btw-berekening — een offerte is niet-bindend. De PDF is
                        het document zelf.
                      </p>

                      <div className="flex flex-col gap-1.5">
                        <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                          Voorsteltekst (markdown)
                        </label>
                        <Textarea
                          value={offerteProse}
                          onChange={(e) => setOfferteProse(e.target.value)}
                          placeholder={
                            "## Wat we voorstellen\n\nKorte intro…\n\n- Aanpak\n- Wat je mag verwachten"
                          }
                          rows={8}
                          data-testid="input-offerte-prose"
                          className={INPUT_CLASS}
                        />
                        <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                          Interne nota's en [AAN TE VULLEN]-placeholders worden
                          automatisch verwijderd. Tekst optioneel — alleen
                          prijzen mag ook.
                        </span>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                          Prijsregels (excl. btw)
                        </label>
                        {offerteLines.map((line, i) => (
                          <div
                            key={i}
                            className="grid gap-2 sm:grid-cols-[1fr_110px_130px_auto] items-center"
                          >
                            <Input
                              value={line.label}
                              onChange={(e) =>
                                updateOfferteLine(i, { label: e.target.value })
                              }
                              placeholder="Omschrijving"
                              data-testid={`input-offerte-line-label-${i}`}
                              className={INPUT_CLASS}
                            />
                            <Input
                              value={line.amountEur}
                              onChange={(e) =>
                                updateOfferteLine(i, {
                                  amountEur: e.target.value,
                                })
                              }
                              placeholder="€ bedrag"
                              inputMode="decimal"
                              data-testid={`input-offerte-line-amount-${i}`}
                              className={INPUT_CLASS}
                            />
                            <select
                              value={line.recurrence}
                              onChange={(e) =>
                                updateOfferteLine(i, {
                                  recurrence: e.target.value as
                                    | "eenmalig"
                                    | "maandelijks",
                                })
                              }
                              data-testid={`select-offerte-line-recurrence-${i}`}
                              className={`${INPUT_CLASS} w-full`}
                            >
                              <option value="maandelijks">Per maand</option>
                              <option value="eenmalig">Eenmalig</option>
                            </select>
                            <button
                              onClick={() => removeOfferteLine(i)}
                              disabled={offerteLines.length <= 1}
                              data-testid={`button-offerte-line-remove-${i}`}
                              title="Regel verwijderen"
                              className="p-2 border-2 border-foreground/30 text-muted-foreground hover:border-destructive hover:text-destructive transition-colors disabled:opacity-30 disabled:pointer-events-none"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={addOfferteLine}
                          disabled={offerteLines.length >= 25}
                          data-testid="button-offerte-line-add"
                          className="self-start py-2 px-3 border-2 border-dashed border-foreground/40 text-foreground font-['Space_Mono'] text-[10px] uppercase tracking-widest flex items-center gap-2 hover:border-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Regel toevoegen
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                            Geldig tot
                          </label>
                          <Input
                            value={offerteValidUntil}
                            onChange={(e) =>
                              setOfferteValidUntil(e.target.value)
                            }
                            placeholder="Leeg = 30 dagen (bv. 31 juli 2026)"
                            data-testid="input-offerte-valid-until"
                            className={INPUT_CLASS}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleOfferte}
                          disabled={offerteGenerating || !offerteHasValidLine}
                          data-testid="button-offerte-download"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {offerteGenerating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <FileDown className="w-4 h-4" />
                          )}
                          Offerte (PDF)
                        </button>
                        {!offerteHasValidLine && (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul minstens één prijsregel in
                          </span>
                        )}
                      </div>
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
