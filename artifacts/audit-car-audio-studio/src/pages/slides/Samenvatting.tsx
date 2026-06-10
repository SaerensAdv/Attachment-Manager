export default function Samenvatting() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Managementsamenvatting
        </p>
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[62vw] text-balance">
          Meer verkeer, maar de leads worden duurder
        </h2>
      </div>

      <div className="absolute top-[35vh] left-[6vw] w-[45vw]">
        <p className="text-[1.65vw] leading-[1.55] text-[#33333c] text-pretty">
          Car Audio Limburg Studio kreeg in 2026 méér vertoningen en méér
          klikken dan in dezelfde periode vorig jaar, maar het aantal getelde
          conversies zakte van 88 naar 45. Een deel daarvan is een striktere
          meting sinds begin 2026 — toch daalden ook de directe contactacties
          (telefoon, mail, contact) écht, van 81 naar 29.
        </p>
        <p className="text-[1.65vw] leading-[1.55] text-[#33333c] mt-[3vh] text-pretty">
          De meting werkt — het probleem zit grotendeels in de strategie. Het
          volledige budget loopt nu via één campagne met de biedstrategie Max.
          clicks, terwijl de gerichtere campagnes uit 2025 op pauze staan.
        </p>
      </div>

      <div className="absolute top-[35vh] right-[6vw] w-[40vw] grid grid-cols-2 gap-[1.4vw]">
        <div className="bg-white rounded-[0.8vw] border border-[#e4e2ee] p-[1.7vw]">
          <p className="text-muted text-[0.95vw] uppercase tracking-[0.14em]">
            Kosten
          </p>
          <p className="font-display font-extrabold text-[2.7vw] text-text mt-[0.4vh] leading-none">
            −4%
          </p>
          <p className="text-muted text-[1.05vw] mt-[1vh]">€2.317,43 in 2026</p>
        </div>
        <div className="bg-white rounded-[0.8vw] border border-[#e4e2ee] p-[1.7vw]">
          <p className="text-muted text-[0.95vw] uppercase tracking-[0.14em]">
            Klikken
          </p>
          <p className="font-display font-extrabold text-[2.7vw] text-text mt-[0.4vh] leading-none">
            +17%
          </p>
          <p className="text-muted text-[1.05vw] mt-[1vh]">2.288 in 2026</p>
        </div>
        <div className="bg-white rounded-[0.8vw] border border-[#e4e2ee] p-[1.7vw]">
          <p className="text-muted text-[0.95vw] uppercase tracking-[0.14em]">
            Conversies
          </p>
          <p className="font-display font-extrabold text-[2.7vw] text-[#c0392b] mt-[0.4vh] leading-none">
            −49%
          </p>
          <p className="text-muted text-[1.05vw] mt-[1vh]">45 in 2026</p>
        </div>
        <div className="bg-white rounded-[0.8vw] border border-[#e4e2ee] p-[1.7vw]">
          <p className="text-muted text-[0.95vw] uppercase tracking-[0.14em]">
            Kost per conversie
          </p>
          <p className="font-display font-extrabold text-[2.7vw] text-[#c0392b] mt-[0.4vh] leading-none">
            +89%
          </p>
          <p className="text-muted text-[1.05vw] mt-[1vh]">€51,50 in 2026</p>
        </div>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald 9 juni 2026 · periode 1 jan – 9 jun
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        02 / 11
      </p>
    </div>
  );
}
