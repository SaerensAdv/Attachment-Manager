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
          [Kernboodschap in één zin]
        </h2>
      </div>

      <div className="absolute top-[35vh] left-[6vw] w-[45vw]">
        <p className="text-[1.65vw] leading-[1.55] text-[#33333c] text-pretty">
          [Alinea 1 — schets de situatie: wat ging er goed of vooruit, en wat is
          de kern van het probleem. Schrijf in heldere, nuchtere taal en verwijs
          naar de cijfers rechts.]
        </p>
        <p className="text-[1.65vw] leading-[1.55] text-[#33333c] mt-[3vh] text-pretty">
          [Alinea 2 — het reële signaal achter de cijfers: wat moet de klant
          écht onthouden, en wat is de eerste stap. Houd het eerlijk en zonder
          jargon.]
        </p>
      </div>

      <div className="absolute top-[35vh] right-[6vw] w-[40vw] grid grid-cols-2 gap-[1.4vw]">
        <div className="bg-white rounded-[0.8vw] border border-[#e4e2ee] p-[1.7vw]">
          <p className="text-muted text-[0.95vw] uppercase tracking-[0.14em]">
            Kosten
          </p>
          <p className="font-display font-extrabold text-[2.7vw] text-text mt-[0.4vh] leading-none">
            +20%
          </p>
          <p className="text-muted text-[1.05vw] mt-[1vh]">€2.310,49 · 1 jan – 12 jun</p>
        </div>
        <div className="bg-white rounded-[0.8vw] border border-[#e4e2ee] p-[1.7vw]">
          <p className="text-muted text-[0.95vw] uppercase tracking-[0.14em]">
            Klikken
          </p>
          <p className="font-display font-extrabold text-[2.7vw] text-text mt-[0.4vh] leading-none">
            +23%
          </p>
          <p className="text-muted text-[1.05vw] mt-[1vh]">7.373 · 1 jan – 12 jun</p>
        </div>
        <div className="bg-white rounded-[0.8vw] border border-[#e4e2ee] p-[1.7vw]">
          <p className="text-muted text-[0.95vw] uppercase tracking-[0.14em]">
            Conversies
          </p>
          <p className="font-display font-extrabold text-[2.7vw] text-[#c0392b] mt-[0.4vh] leading-none">
            −97%
          </p>
          <p className="text-muted text-[1.05vw] mt-[1vh]">1 · 1 jan – 12 jun</p>
        </div>
        <div className="bg-white rounded-[0.8vw] border border-[#e4e2ee] p-[1.7vw]">
          <p className="text-muted text-[0.95vw] uppercase tracking-[0.14em]">
            Conversiewaarde
          </p>
          <p className="font-display font-extrabold text-[2.7vw] text-[#c0392b] mt-[0.4vh] leading-none">
            −71%
          </p>
          <p className="text-muted text-[1.05vw] mt-[1vh]">€179,00 · 1 jan – 12 jun</p>
        </div>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald 12 juni 2026 · periode 1 jan – 12 jun
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        02 / 11
      </p>
    </div>
  );
}
