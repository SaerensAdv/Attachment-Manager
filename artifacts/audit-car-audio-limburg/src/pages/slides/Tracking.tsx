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
          Wat de cijfers echt vertellen
        </h2>
      </div>

      <div className="absolute top-[31vh] left-[6vw] w-[47vw]">
        <div className="flex items-start gap-[1.4vw] mb-[3vh]">
          <div className="w-[0.9vw] h-[0.9vw] bg-primary mt-[1vh] shrink-0" />
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            <span className="font-semibold text-text">
              De meting werkt — de volledige webshop-funnel wordt sinds 2026
              gevolgd.
            </span>{" "}
            6.443 productweergaves, 14 keer toevoegen aan winkelwagen, 4
            checkouts.
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw] mb-[3vh]">
          <div className="w-[0.9vw] h-[0.9vw] bg-primary mt-[1vh] shrink-0" />
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            <span className="font-semibold text-text">
              De funnel stokt ná de winkelwagen: 14 toevoegingen → 1 aankoop.
            </span>{" "}
            Dat wijst op site, aanbod of prijs — geen meetfout.
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw] mb-[3vh]">
          <div className="w-[0.9vw] h-[0.9vw] bg-primary mt-[1vh] shrink-0" />
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            <span className="font-semibold text-text">
              Het contactformulier wordt niet meer geteld.
            </span>{" "}
            In 2025 leverde dat 18 conversies; sinds de herziening verdwijnt die
            lead uit de cijfers.
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw]">
          <div className="w-[0.9vw] h-[0.9vw] bg-primary mt-[1vh] shrink-0" />
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            <span className="font-semibold text-text">
              De getelde aankoopwaarde zakte naar €179.
            </span>{" "}
            Een daling van 71% tegenover 2025.
          </p>
        </div>
      </div>

      <div className="absolute top-[31vh] right-[6vw] w-[33vw] bg-white rounded-[1vw] border-2 border-[#f4a425] p-[2.4vw]">
        <p className="text-[#33333c] text-[1vw] font-bold uppercase tracking-[0.16em] mb-[1.6vh]">
          Eerste actie · Hoog
        </p>
        <p className="text-[1.7vw] font-display font-bold leading-[1.25] text-text text-pretty">
          Herstel de contactformulier-meting en valideer de aankoop-tag
        </p>
        <p className="text-[1.4vw] text-muted leading-[1.45] mt-[2vh] text-pretty">
          Zo wordt elke lead opnieuw geteld en kunnen we de funnel-uitval na de
          winkelwagen gericht aanpakken.
        </p>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald 9 juni 2026 · periode 1 jan – 9 jun
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        07 / 11
      </p>
    </div>
  );
}
