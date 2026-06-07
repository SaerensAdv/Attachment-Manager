import { SEO } from "@/components/seo";
import { Link } from "wouter";
import { ArrowRight, BarChart3, CheckCircle2, Target, TrendingUp, ShieldCheck } from "lucide-react";

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Saerens Advertising",
    "url": "https://saerens.agency",
    "logo": "https://saerens.agency/logo.png",
    "description": "AI Marketing Bureau in België dat bewijs levert door meetbare groei.",
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "BE"
    }
  };

  return (
    <>
      <SEO 
        title="AI Marketing Bureau in België — Saerens Advertising"
        description="Google Ads, SEO en AI-gestuurde marketing. Saerens Advertising: transparant, meetbaar, geen overpromises. Ontdek onze aanpak."
        url="https://saerens.agency"
        jsonLd={jsonLd}
      />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-background to-background pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/50 border border-border mb-8">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Google Partner in België & Nederland</span>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
              AI Marketing Bureau in België dat bewijs levert
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-3xl mx-auto leading-relaxed">
              Saerens Advertising zet AI in als werktuig om Google Ads-campagnes te beheren, organische groei te bouwen en betere keuzes sneller te maken. Geen garanties die we niet kunnen waarmaken — wel transparante aanpak en meetbare resultaten.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link 
                href="/ai-marketing" 
                className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-full bg-primary px-8 text-base font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:scale-105"
              >
                Ontdek de aanpak
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
              <Link 
                href="/contact" 
                className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-full bg-secondary px-8 text-base font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 border border-border"
              >
                Neem contact op
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Proof Points */}
      <section className="py-12 border-y border-white/5 bg-[#080809]">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4 text-center">
            <div className="flex flex-col items-center justify-center">
              <span className="text-3xl md:text-4xl font-bold text-accent mb-2">3,93×</span>
              <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Gemiddelde ROAS</span>
            </div>
            <div className="flex flex-col items-center justify-center">
              <span className="text-3xl md:text-4xl font-bold text-accent mb-2">€1,58M</span>
              <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Conversiewaarde</span>
            </div>
            <div className="flex flex-col items-center justify-center">
              <span className="text-3xl md:text-4xl font-bold text-accent mb-2">1.820+</span>
              <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Leads gegenereerd</span>
            </div>
            <div className="flex flex-col items-center justify-center">
              <span className="text-3xl md:text-4xl font-bold text-accent mb-2">€456K</span>
              <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Adspend beheerd (365d)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Wat is anders */}
      <section className="py-24 md:py-32">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">Wat is anders</h2>
            <p className="text-lg text-muted-foreground">
              De marketingwereld zit vol beloftes. Wij geloven in systemen, data en eerlijkheid.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-card p-8 rounded-2xl border border-border flex flex-col">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                <Target className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-4">AI als werktuig</h3>
              <p className="text-muted-foreground leading-relaxed">
                Wij gebruiken AI niet als marketingterm, maar als onderdeel van ons dagelijks werk. Campagneanalyse, contentplanning, zoekwoordonderzoek — AI maakt het sneller en grondiger.
              </p>
            </div>
            
            <div className="bg-card p-8 rounded-2xl border border-border flex flex-col">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-4">Transparante rapportering</h3>
              <p className="text-muted-foreground leading-relaxed">
                U ziet wat er gebeurt. Geen verborgen kosten, geen verbloemde resultaten. We rapporteren wat werkt en wat niet, en passen aan op basis van data.
              </p>
            </div>

            <div className="bg-card p-8 rounded-2xl border border-border flex flex-col">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-4">Eerlijk over verwachtingen</h3>
              <p className="text-muted-foreground leading-relaxed">
                Goede resultaten via Google Ads kosten tijd — doorgaans drie maanden data en iteratie voordat een campagne optimaal presteert. Dat zeggen we van bij het begin.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5" />
        <div className="container mx-auto px-4 md:px-6 relative z-10 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Klaar om samen te werken?</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Stel uw vraag of plan een vrijblijvend gesprek. We bespreken uw situatie eerlijk — inclusief of Google Ads of SEO voor u de juiste keuze is.
          </p>
          <Link 
            href="/contact" 
            className="inline-flex h-14 items-center justify-center rounded-full bg-accent px-10 text-lg font-bold text-accent-foreground transition-all hover:bg-accent/90 hover:scale-105"
          >
            Neem contact op
            <ArrowRight className="ml-2 w-5 h-5" />
          </Link>
        </div>
      </section>
    </>
  );
}
