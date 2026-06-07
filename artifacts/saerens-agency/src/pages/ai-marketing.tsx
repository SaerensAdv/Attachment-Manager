import { SEO } from "@/components/seo";
import { Link } from "wouter";
import { ArrowRight, Search, Target, Settings, FileText, ChevronDown } from "lucide-react";

export default function AIMarketing() {
  const faqData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Is AI marketing geschikt voor kleine bedrijven?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Ja — AI-tools verlagen de drempel voor professionele campagneanalyse en contentplanning, ook voor KMO's met beperkt budget."
        }
      },
      {
        "@type": "Question",
        "name": "Vervangt AI marketing het menselijk oordeel?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Nee. AI verwerkt data sneller, maar strategie, context en klantenrelaties vereisen menselijk inzicht. Bij Saerens is AI een werktuig, geen vervanger."
        }
      },
      {
        "@type": "Question",
        "name": "Hoe meet ik of AI marketing werkt voor mijn bedrijf?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Via concrete KPIs: organische klikken, conversies, kostprijs per lead of ROAS. Saerens rapporteert op business-uitkomsten, niet op ijdele statistieken."
        }
      }
    ]
  };

  return (
    <>
      <SEO 
        title="Wat is AI Marketing? De aanpak van Saerens Advertising"
        description="AI marketing is geen buzzword bij Saerens. Ontdek hoe we AI inzetten als concreet werktuig voor Google Ads en organische groei."
        url="https://saerens.agency/ai-marketing"
        jsonLd={faqData}
      />
      
      <section className="pt-32 pb-20 md:pt-40 md:pb-24 border-b border-border">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-8">
              Wat is AI marketing — en hoe zet Saerens het in voor uw groei?
            </h1>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-32">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid md:grid-cols-2 gap-16 items-start">
            <div>
              <h2 className="text-3xl font-bold mb-6">Wat is AI marketing?</h2>
              <div className="space-y-6 text-lg text-muted-foreground leading-relaxed">
                <p>
                  AI marketing betekent dat softwaresystemen op basis van kunstmatige intelligentie een deel van het marketingwerk overnemen of ondersteunen: zoekwoordanalyse, campagne-optimalisatie, contentplanning, rapportering.
                </p>
                <p>
                  Het resultaat is sneller werken, minder handmatige fouten en betere beslissingen op basis van data.
                </p>
                <p className="font-medium text-foreground p-6 bg-card border border-border rounded-2xl">
                  Bij Saerens gebruiken we AI niet als label op een bestaand aanbod. We zetten het in als concreet onderdeel van ons werk — voor onze eigen groei en voor die van onze klanten.
                </p>
              </div>
            </div>
            
            <div className="grid gap-6 relative">
              <div className="absolute left-6 top-8 bottom-8 w-px bg-border hidden md:block"></div>
              
              <div className="bg-background/50 backdrop-blur border border-border p-6 rounded-2xl relative z-10">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                    <Search className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">1. Analyse</h3>
                    <p className="text-muted-foreground">AI-tools analyseren zoekgedrag, concurrentiepositie en campagneprestaties sneller dan handmatig mogelijk is.</p>
                  </div>
                </div>
              </div>

              <div className="bg-background/50 backdrop-blur border border-border p-6 rounded-2xl relative z-10">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                    <Target className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">2. Strategie</h3>
                    <p className="text-muted-foreground">Op basis van die analyse bepalen we welke kanalen en boodschappen het meeste rendement opleveren.</p>
                  </div>
                </div>
              </div>

              <div className="bg-background/50 backdrop-blur border border-border p-6 rounded-2xl relative z-10">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                    <Settings className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">3. Uitvoering</h3>
                    <p className="text-muted-foreground">Campagnes, content en SEO worden opgezet en bijgestuurd — met AI als ondersteuning, met mensen als eindverantwoordelijke.</p>
                  </div>
                </div>
              </div>

              <div className="bg-background/50 backdrop-blur border border-border p-6 rounded-2xl relative z-10">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">4. Rapportering</h3>
                    <p className="text-muted-foreground">U ontvangt transparante rapportage over wat werkt, wat niet, en wat we als volgende stap aanbevelen.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-card border-y border-border">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-12 text-center">Veelgestelde vragen</h2>
            
            <div className="space-y-6">
              <div className="border border-border rounded-xl p-6 bg-background/50">
                <h3 className="text-lg font-bold mb-3 flex justify-between items-center">
                  Is AI marketing geschikt voor kleine bedrijven?
                </h3>
                <p className="text-muted-foreground">
                  Ja — AI-tools verlagen de drempel voor professionele campagneanalyse en contentplanning, ook voor KMO's met beperkt budget.
                </p>
              </div>

              <div className="border border-border rounded-xl p-6 bg-background/50">
                <h3 className="text-lg font-bold mb-3 flex justify-between items-center">
                  Vervangt AI marketing het menselijk oordeel?
                </h3>
                <p className="text-muted-foreground">
                  Nee. AI verwerkt data sneller, maar strategie, context en klantenrelaties vereisen menselijk inzicht. Bij Saerens is AI een werktuig, geen vervanger.
                </p>
              </div>

              <div className="border border-border rounded-xl p-6 bg-background/50">
                <h3 className="text-lg font-bold mb-3 flex justify-between items-center">
                  Hoe meet ik of AI marketing werkt voor mijn bedrijf?
                </h3>
                <p className="text-muted-foreground">
                  Via concrete KPIs: organische klikken, conversies, kostprijs per lead of ROAS. Saerens rapporteert op business-uitkomsten, niet op ijdele statistieken.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 text-center">
        <div className="container mx-auto px-4 md:px-6">
          <h2 className="text-3xl md:text-4xl font-bold mb-8">Klaar voor data-gedreven groei?</h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href="/diensten" 
              className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-full bg-primary px-8 text-base font-medium text-primary-foreground transition-all hover:bg-primary/90"
            >
              Bekijk onze diensten
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
      </section>
    </>
  );
}
