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
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[74vw] text-balance">
          Van 88 naar 45: deels strikter geteld, deels echt minder
        </h2>
      </div>

      <div className="absolute top-[26vh] left-[6vw] right-[6vw] grid grid-cols-2 gap-[4vw]">
        <div className="bg-white rounded-[1vw] border border-[#e4e2ee] p-[2.2vw]">
          <div className="flex items-baseline justify-between mb-[2vh]">
            <span className="font-display font-bold text-[1.9vw]">2025</span>
            <span className="text-muted text-[1vw] uppercase tracking-[0.14em]">
              88 geteld als conversie
            </span>
          </div>
          <div className="flex items-center justify-between py-[1.15vh] border-b border-[#eee] text-[1.5vw]">
            <span>Klik op telefoon</span>
            <span className="font-semibold">44</span>
          </div>
          <div className="flex items-center justify-between py-[1.15vh] border-b border-[#eee] text-[1.5vw]">
            <span>Klik op mail</span>
            <span className="font-semibold">21</span>
          </div>
          <div className="flex items-center justify-between py-[1.15vh] border-b border-[#eee] text-[1.5vw]">
            <span>Contactaanvraag</span>
            <span className="font-semibold">16</span>
          </div>
          <div className="flex items-center justify-between py-[1.15vh] text-[1.5vw]">
            <span>Offerte-tab geopend</span>
            <span className="font-semibold">7</span>
          </div>
        </div>

        <div className="bg-white rounded-[1vw] border border-[#e4e2ee] p-[2.2vw]">
          <div className="flex items-baseline justify-between mb-[2vh]">
            <span className="font-display font-bold text-[1.9vw]">2026</span>
            <span className="text-muted text-[1vw] uppercase tracking-[0.14em]">
              45 geteld als conversie
            </span>
          </div>
          <div className="flex items-center justify-between py-[1.15vh] border-b border-[#eee] text-[1.5vw]">
            <span>Offerteaanvraag</span>
            <span className="font-semibold">16</span>
          </div>
          <div className="flex items-center justify-between py-[1.15vh] border-b border-[#eee] text-[1.5vw]">
            <span>Klik op telefoon</span>
            <span className="font-semibold text-[#c0392b]">15</span>
          </div>
          <div className="flex items-center justify-between py-[1.15vh] border-b border-[#eee] text-[1.5vw]">
            <span>Klik op mail</span>
            <span className="font-semibold text-[#c0392b]">9</span>
          </div>
          <div className="flex items-center justify-between py-[1.15vh] text-[1.5vw]">
            <span>Contactaanvraag</span>
            <span className="font-semibold text-[#c0392b]">5</span>
          </div>
        </div>
      </div>

      <div className="absolute top-[67vh] left-[6vw] right-[6vw]">
        <p className="text-muted text-[0.95vw] uppercase tracking-[0.14em] mb-[1.2vh]">
          Ook gemeten in 2026, maar niet meegeteld in de kolom Conversies
        </p>
        <p className="text-[1.35vw] text-[#33333c] leading-[1.5] text-pretty">
          Lokale interacties 232 · Offerte-tab geopend 150 · Websitebezoeken 62 ·
          Routebeschrijving 41 · Klikken om te bellen 31
        </p>
        <p className="text-[1.35vw] text-[#33333c] leading-[1.5] mt-[2.2vh] max-w-[80vw] text-pretty">
          De zwakke meting ‘offerte-tab geopend’ (7) is begin 2026 vervangen door
          de striktere ‘Offerteaanvraag’ (16) — nauwkeuriger, dus deels een
          meetverschil. Maar telefoon, mail en contact daalden écht: samen van 81
          naar 29.
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
