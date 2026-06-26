import {
  Activity,
  BarChart3,
  Building2,
  FileDown,
  Gauge,
  Globe,
  Loader2,
  MapPin,
  Search,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { INPUT_CLASS } from "@/lib/clients-form";
import type { ClientEditorApi } from "@/hooks/useClientEditor";

/** Sections III–XI — read-only live integrations (intake, Ads, SC, Bing, GA4, Maps, PageSpeed, GMB). */
export default function LiveIntegrations({
  editor,
}: {
  editor: ClientEditorApi;
}) {
  const {
    editing,
    form,
    setField,
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
  } = editor;
  return (
    <>
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
    </>
  );
}
