import { SEO } from "@/components/seo";

export default function Contact() {
  return (
    <>
      <SEO 
        title="Contact — Saerens Advertising"
        description="Stel uw vraag of vraag een vrijblijvend gesprek aan. Saerens Advertising, Google Partner in België."
        url="https://saerens.agency/contact"
      />
      
      <section className="pt-32 pb-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Samenwerken? Neem contact op</h1>
            <p className="text-lg text-muted-foreground">
              Stel uw vraag of vraag een vrijblijvend gesprek aan. We bespreken uw situatie concreet — zonder verkooppraatjes en zonder verborgen agenda.
            </p>
          </div>
          <div className="max-w-xl mx-auto bg-card p-8 rounded-2xl border border-border">
            <p className="text-center text-sm text-muted-foreground mb-8">
              Bedankt voor uw interesse. Neem rechtstreeks contact met ons op via <a href="mailto:info@saerens.agency" className="text-primary hover:underline">info@saerens.agency</a>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
