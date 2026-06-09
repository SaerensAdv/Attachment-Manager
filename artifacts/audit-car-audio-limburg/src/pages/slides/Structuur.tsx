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
          <div className="flex items-center justify-between px-[1.8vw] py-[2.1vh]">
            <span className="text-[1.5vw] font-medium">Shopping</span>
            <span className="text-[1.4vw] text-muted">€1.386,95 · 1 conv.</span>
          </div>
          <div className="flex items-center justify-between px-[1.8vw] py-[2.1vh]">
            <span className="text-[1.5vw] font-medium">
              Search · CarPlay (Max. clicks)
            </span>
            <span className="text-[1.4vw] text-muted">€864,84 · 0 conv.</span>
          </div>
          <div className="flex items-center justify-between px-[1.8vw] py-[2.1vh]">
            <span className="text-[1.5vw] font-medium">Search · Brand</span>
            <span className="text-[1.4vw] text-muted">€16,91 · 0 conv.</span>
          </div>
        </div>
      </div>

      <div className="absolute top-[31vh] right-[6vw] w-[41vw]">
        <p className="text-text font-display font-bold text-[1.4vw] uppercase tracking-[0.12em] mb-[2vh]">
          Op pauze · cijfers 2025
        </p>
        <div className="bg-white rounded-[0.9vw] border border-[#e4e2ee] divide-y divide-[#e4e2ee]">
          <div className="px-[1.8vw] py-[2.1vh]">
            <div className="flex items-center justify-between">
              <span className="text-[1.5vw] font-medium">
                Performance Max (Feed Only)
              </span>
              <span className="text-[1.4vw] font-semibold text-primary">
                CPA €83,93
              </span>
            </div>
            <span className="text-[1.3vw] text-muted">€923,19 · 11 conv.</span>
          </div>
          <div className="px-[1.8vw] py-[2.1vh]">
            <div className="flex items-center justify-between">
              <span className="text-[1.5vw] font-medium">Search Algemeen</span>
              <span className="text-[1.4vw] font-semibold text-primary">
                CPA €40,28
              </span>
            </div>
            <span className="text-[1.3vw] text-muted">€765,41 · 19 conv.</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[10vh] left-[6vw] right-[6vw] bg-[#29274e] rounded-[0.9vw] px-[2.4vw] py-[2.6vh]">
        <p className="text-white text-[1.5vw] leading-[1.4] text-pretty">
          <span className="font-bold text-[#f4a425]">30 van de 31</span>{" "}
          conversies in 2025 kwamen uit deze twee campagnes — die nu stilliggen.
          Van de 50 campagnes in het account zijn er nog 3 actief.
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
