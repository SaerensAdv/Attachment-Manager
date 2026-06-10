export default function ConversiesPerActie() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Conversies per actie · 2025 vs 2026
        </p>
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[72vw] text-balance">
          Waarom de teller van 31 naar 1 zakte
        </h2>
      </div>

      <div className="absolute top-[26vh] left-[6vw] right-[6vw] grid grid-cols-2 gap-[4vw]">
        <div className="bg-white rounded-[1vw] border border-[#e4e2ee] p-[2.2vw]">
          <div className="flex items-baseline justify-between mb-[2vh]">
            <span className="font-display font-bold text-[1.9vw]">2025</span>
            <span className="text-muted text-[1vw] uppercase tracking-[0.14em]">
              31 geteld als conversie
            </span>
          </div>
          <div className="flex items-center justify-between py-[1.3vh] border-b border-[#eee] text-[1.5vw]">
            <span>Contactformulier ingevuld</span>
            <span className="font-semibold">18</span>
          </div>
          <div className="flex items-center justify-between py-[1.3vh] text-[1.5vw]">
            <span>Aankoop (webshop)</span>
            <span className="font-semibold">13</span>
          </div>
        </div>

        <div className="bg-white rounded-[1vw] border border-[#e4e2ee] p-[2.2vw]">
          <div className="flex items-baseline justify-between mb-[2vh]">
            <span className="font-display font-bold text-[1.9vw]">2026</span>
            <span className="text-muted text-[1vw] uppercase tracking-[0.14em]">
              1 geteld als conversie
            </span>
          </div>
          <div className="flex items-center justify-between py-[1.3vh] text-[1.5vw]">
            <span>Aankoop (webshop)</span>
            <span className="font-bold text-[#c0392b]">1</span>
          </div>
        </div>
      </div>

      <div className="absolute top-[57vh] left-[6vw] right-[6vw]">
        <p className="text-muted text-[0.95vw] uppercase tracking-[0.14em] mb-[1.2vh]">
          Ook gemeten in 2026, maar niet meegeteld in de kolom Conversies
        </p>
        <p className="text-[1.35vw] text-[#33333c] leading-[1.5] text-pretty">
          Productweergave 6.443 · Toevoegen aan winkelwagen 14 · Checkout gestart
          4 · Routebeschrijving 73 · Klikken om te bellen 33
        </p>
        <p className="text-[1.35vw] text-[#33333c] leading-[1.5] mt-[2.4vh] max-w-[80vw] text-pretty">
          Twee zaken spelen samen. Sinds de tracking-herziening begin 2026 wordt
          het contactformulier niet meer als conversie geteld (18 in 2025), en de
          gemeten aankopen daalden van 13 naar 1. De webshop-funnel wordt nu wél
          volledig gemeten — de meting zelf werkt dus.
        </p>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald 9 juni 2026 · periode 1 jan – 9 jun
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        05 / 11
      </p>
    </div>
  );
}
