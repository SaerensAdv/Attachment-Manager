export default function Tracking() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Bevinding 1 · Meting
        </p>
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[70vw] text-balance">
          Waarom de cijfers op een meetfout wijzen
        </h2>
      </div>

      <div className="absolute top-[31vh] left-[6vw] w-[47vw]">
        <div className="flex items-start gap-[1.4vw] mb-[3vh]">
          <div className="w-[0.9vw] h-[0.9vw] bg-primary mt-[1vh] shrink-0" />
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            <span className="font-semibold text-text">
              23% méér klikken, 97% minder conversies.
            </span>{" "}
            Dat gedraagt zich als een meet-, niet als een marktprobleem.
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw] mb-[3vh]">
          <div className="w-[0.9vw] h-[0.9vw] bg-primary mt-[1vh] shrink-0" />
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            <span className="font-semibold text-text">
              Shopping: €1.386,95 over 6.042 klikken → 1 conversie.
            </span>{" "}
            Onwaarschijnlijk laag voor een webshop met dit verkeer.
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw] mb-[3vh]">
          <div className="w-[0.9vw] h-[0.9vw] bg-primary mt-[1vh] shrink-0" />
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            <span className="font-semibold text-text">
              Search ‘CarPlay’ (Max. clicks): €864,84 over 981 klikken → 0
              conversies.
            </span>{" "}
            Geen enkele meetbare actie geregistreerd.
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw]">
          <div className="w-[0.9vw] h-[0.9vw] bg-primary mt-[1vh] shrink-0" />
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            <span className="font-semibold text-text">
              Conversiewaarde zakte naar €179.
            </span>{" "}
            Een daling van 71% tegenover 2025.
          </p>
        </div>
      </div>

      <div className="absolute top-[31vh] right-[6vw] w-[33vw] bg-white rounded-[1vw] border-2 border-[#f4a425] p-[2.4vw]">
        <p className="text-[#c0392b] text-[1vw] font-bold uppercase tracking-[0.16em] mb-[1.6vh]">
          Eerste actie · Blokkerend
        </p>
        <p className="text-[1.7vw] font-display font-bold leading-[1.25] text-text text-pretty">
          Controleer de Google Ads-tag en Enhanced Conversions
        </p>
        <p className="text-[1.4vw] text-muted leading-[1.45] mt-[2vh] text-pretty">
          Valideer met testconversies vóór elke verdere optimalisatie. Zonder
          betrouwbare meting is sturen op resultaat onmogelijk.
        </p>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald 9 juni 2026 · periode 1 jan – 9 jun
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        06 / 10
      </p>
    </div>
  );
}
