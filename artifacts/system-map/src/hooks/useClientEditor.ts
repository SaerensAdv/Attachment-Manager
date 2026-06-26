import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
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
  useCreateClientGroup,
  getGetClientsQueryKey,
  getGetClientGroupsQueryKey,
  getGetDocGraphQueryKey,
  type Client,
  type ClientInput,
  type ClientGroupSummary,
  type BriefingSuggestions,
} from "@workspace/api-client-react";
import {
  EMPTY_FORM,
  clientToForm,
  formToInput,
  asConflict,
  type FormState,
} from "@/lib/clients-form";

export type LiveData = { text: string | null; at: string | null };

export type OfferteLine = {
  label: string;
  amountEur: string;
  recurrence: "eenmalig" | "maandelijks";
};

export type DeckResult = {
  kind: "audit" | "qbr";
  period: string;
  previewPath: string;
};

/**
 * Owns the full client-dossier editor: every piece of editor state, the
 * create/update/delete mutations, all live-data refresh handlers, and the
 * deterministic PDF/deck exports. Lifted out of the page verbatim so the page
 * and the editor sub-components stay thin. Pass in the loaded `groups` (needed
 * for the effective-fee fallback and inline group creation).
 */
export function useClientEditor(groups: ClientGroupSummary[]) {
  const queryClient = useQueryClient();

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
  // Website-intake (fase 2) is managed outside the editable form: it is set by
  // the read-website endpoint, not by the briefing fields.
  const [intake, setIntake] = useState<LiveData>({ text: null, at: null });
  // Live Google Ads (fase 3) — set by the google-ads-refresh endpoint; the
  // customer id itself is an editable briefing field.
  const [liveAds, setLiveAds] = useState<LiveData>({ text: null, at: null });
  // Live competitor ads (Ads Transparency Center) — set by the
  // competitor-ads-refresh endpoint; the advertiser list is an editable field.
  const [liveCompetitors, setLiveCompetitors] = useState<LiveData>({
    text: null,
    at: null,
  });
  // Live Search Console (fase 4) — set by the search-console-refresh endpoint;
  // the property URL is an editable field.
  const [liveSearchConsole, setLiveSearchConsole] = useState<LiveData>({
    text: null,
    at: null,
  });
  // Live Bing Webmaster — set by the bing-refresh endpoint; the verified site
  // URL is an editable field. Bing's BE/NL share is small, so this is a
  // supplementary organic-search source next to Search Console.
  const [liveBing, setLiveBing] = useState<LiveData>({ text: null, at: null });
  // Live GA4 analytics (fase 4) — set by the ga4-refresh endpoint; the property
  // id is an editable field.
  const [liveGa4, setLiveGa4] = useState<LiveData>({ text: null, at: null });
  // Live Google Maps / Places (fase 4) — set by the places-refresh endpoint; the
  // own-listing query + competitor queries are editable fields.
  const [livePlaces, setLivePlaces] = useState<LiveData>({
    text: null,
    at: null,
  });
  // Live PageSpeed Insights (fase 4) — set by the pagespeed-refresh endpoint; the
  // landing-page URL list is an editable field.
  const [livePagespeed, setLivePagespeed] = useState<LiveData>({
    text: null,
    at: null,
  });
  // Live Google Business Profile (fase 4) — set by the business-profile-refresh
  // endpoint; the location id is an editable field.
  const [liveBusinessProfile, setLiveBusinessProfile] = useState<LiveData>({
    text: null,
    at: null,
  });
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
  const [offerteLines, setOfferteLines] = useState<OfferteLine[]>([
    {
      label: "Beheer Google Ads — maandelijkse vergoeding",
      amountEur: "",
      recurrence: "maandelijks",
    },
  ]);
  const [offerteValidUntil, setOfferteValidUntil] = useState("");
  const [offerteGenerating, setOfferteGenerating] = useState(false);
  const [deckBusy, setDeckBusy] = useState<"audit" | "qbr" | null>(null);
  const [deckResult, setDeckResult] = useState<DeckResult | null>(null);
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

  const groupCreateMut = useCreateClientGroup();
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

  const handleGenerateDeck = async (kind: "audit" | "qbr") => {
    if (typeof editing !== "number") return;
    setFormError(null);
    setDeckResult(null);
    setDeckBusy(kind);
    try {
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/clients/${editing}/generate-deck`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }),
        },
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
      const j = (await res.json()) as {
        kind: "audit" | "qbr";
        period: string;
        previewPath: string;
      };
      setDeckResult({
        kind: j.kind,
        period: j.period,
        previewPath: j.previewPath,
      });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Deck genereren mislukt",
      );
    } finally {
      setDeckBusy(null);
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
    patch: Partial<OfferteLine>,
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

  return {
    // identity / open state
    editing,
    form,
    setField,
    formError,
    invalidate,
    // group + fee
    groupId,
    setGroupId,
    monthlyFee,
    setMonthlyFee,
    newGroupName,
    setNewGroupName,
    creatingGroup,
    handleCreateGroup,
    effectiveFee,
    // live data
    intake,
    liveAds,
    liveCompetitors,
    liveSearchConsole,
    liveBing,
    liveGa4,
    livePlaces,
    livePagespeed,
    liveBusinessProfile,
    intaking,
    refreshingAds,
    refreshingCompetitors,
    refreshingSearchConsole,
    refreshingBing,
    refreshingGa4,
    refreshingPlaces,
    refreshingPagespeed,
    refreshingBusinessProfile,
    snapshotting,
    handleWebsiteIntake,
    handleGoogleAds,
    handleSnapshot,
    handleCompetitorAds,
    handleSearchConsole,
    handleBing,
    handleGa4,
    handlePlaces,
    handlePagespeed,
    handleBusinessProfile,
    // briefing suggestions
    briefingSuggestions,
    briefingNotes,
    suggestingBriefing,
    handleBriefingSuggest,
    applySuggestion,
    applyAllSuggestions,
    clearBriefingSuggestions,
    // billing
    factuurPreviewing,
    issuingInvoice,
    confirmIssue,
    setConfirmIssue,
    handleFactuurPreview,
    handleIssueInvoice,
    // offerte
    offerteProse,
    setOfferteProse,
    offerteLines,
    offerteValidUntil,
    setOfferteValidUntil,
    offerteGenerating,
    offerteHasValidLine,
    updateOfferteLine,
    addOfferteLine,
    removeOfferteLine,
    handleOfferte,
    // decks
    deckBusy,
    deckResult,
    handleGenerateDeck,
    // actions
    startCreate,
    startEdit,
    closeEditor,
    handleSave,
    handleDelete,
    saving,
    deleting,
    confirmDelete,
    setConfirmDelete,
  };
}

export type ClientEditorApi = ReturnType<typeof useClientEditor>;
