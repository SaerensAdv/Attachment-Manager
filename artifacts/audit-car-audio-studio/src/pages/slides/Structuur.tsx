export default function Structuur() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Bevinding 2 · Structuur
        </p>
        <h2 className="font-display font-extrabold text-[3.1vw] leading-[1.06] tracking-tight max-w-[78vw] text-balance">
          Het budget loopt niet meer via de campagnes die leads brachten
        </h2>
      </div>

      <div className="absolute top-[31vh] left-[6vw] w-[41vw]">
        <p className="text-text font-display font-bold text-[1.4vw] uppercase tracking-[0.12em] mb-[2vh]">
          Actief in 2026
        </p>
        <div className="bg-white rounded-[0.9vw] border border-[#e4e2ee] divide-y divide-[#e4e2ee]">
          <div className="px-[1.8vw] py-[2.1vh]">
            <div className="flex items-center justify-between">
              <span className="text-[1.5vw] font-medium">
                Car Audio Upgrades · Max. clicks
              </span>
              <span className="text-[1.4vw] font-semibold text-[#c0392b]">
                CPA €51,50
              </span>
            </div>
            <span className="text-[1.3vw] text-muted">€2.317,43 · 45 conv.</span>
          </div>
          <div className="flex items-center justify-between px-[1.8vw] py-[2.1vh]">
            <span className="text-[1.5vw] font-medium">
              4 andere campagnes ‘actief’
            </span>
            <span className="text-[1.4vw] text-muted">€0 · geen verkeer</span>
          </div>
        </div>
      </div>

      <div className="absolute top-[31vh] right-[6vw] w-[41vw]">
        <p className="text-text font-display font-bold text-[1.4vw] uppercase tracking-[0.12em] mb-[2vh]">
          Op pauze · cijfers 2025
        </p>
        <div className="bg-white rounded-[0.9vw] border border-[#e4e2ee] divide-y divide-[#e4e2ee]">
          <div className="px-[1.8vw] py-[1.9vh]">
            <div className="flex items-center justify-between">
              <span className="text-[1.5vw] font-medium">Audio upgrades NL</span>
              <span className="text-[1.4vw] font-semibold text-primary">
                CPA €22,06
              </span>
            </div>
            <span className="text-[1.3vw] text-muted">€1.433,81 · 65 conv.</span>
          </div>
          <div className="px-[1.8vw] py-[1.9vh]">
            <div className="flex items-center justify-between">
              <span className="text-[1.5vw] font-medium">Audio upgrades BE</span>
              <span className="text-[1.4vw] font-semibold text-primary">
                CPA €37,54
              </span>
            </div>
            <span className="text-[1.3vw] text-muted">€450,49 · 12 conv.</span>
          </div>
          <div className="px-[1.8vw] py-[1.9vh]">
            <div className="flex items-center justify-between">
              <span className="text-[1.5vw] font-medium">
                Audio upgrades NL Doel CPA
              </span>
              <span className="text-[1.4vw] font-semibold text-primary">
                CPA €25,01
              </span>
            </div>
            <span className="text-[1.3vw] text-muted">€200,06 · 8 conv.</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[10vh] left-[6vw] right-[6vw] bg-[#29274e] rounded-[0.9vw] px-[2.4vw] py-[2.6vh]">
        <p className="text-white text-[1.5vw] leading-[1.4] text-pretty">
          <span className="font-bold text-[#f4a425]">85 van de 88</span>{" "}
          conversies in 2025 kwamen uit deze drie campagnes — die nu op pauze of
          €0 staan. Het volledige budget van 2026 loopt via één
          Max-clicks-campagne.
        </p>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald 9 juni 2026 · periode 1 jan – 9 jun
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        07 / 10
      </p>
    </div>
  );
}
