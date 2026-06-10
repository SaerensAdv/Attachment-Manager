export default function Oordeel() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase">
          Oordeel
        </p>
      </div>

      <div className="absolute top-[22vh] left-[6vw] right-[6vw]">
        <h2 className="font-display font-extrabold text-[4.4vw] leading-[1.02] tracking-tight max-w-[74vw] text-balance">
          De campagnes leveren leads, maar tegen bijna dubbele kost
        </h2>
        <p className="mt-[3.5vh] text-[1.9vw] text-muted max-w-[64vw] leading-[1.45] text-pretty">
          Een deel van de daling van 88 naar 45 is een striktere meting sinds
          begin 2026. Maar de directe contactacties daalden écht (81 → 29) en de
          kost per conversie steeg met 89%, bij 17% méér klikken.
        </p>
      </div>

      <div className="absolute bottom-[15vh] left-[6vw] flex items-end gap-[5vw]">
        <div>
          <p className="text-muted text-[1.1vw] uppercase tracking-[0.16em] mb-[1vh]">
            Kost per conversie · 2025 → 2026
          </p>
          <p className="font-display font-extrabold text-[5.6vw] leading-none">
            €27,31 <span className="text-primary">→</span>{" "}
            <span className="text-[#c0392b]">€51,50</span>
          </p>
        </div>
        <div className="bg-accent text-[#1a1a22] rounded-full px-[2.2vw] py-[1.4vh] font-display font-bold text-[1.4vw] mb-[1vh]">
          Status: Verslechterend
        </div>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald 9 juni 2026 · periode 1 jan – 9 jun
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        03 / 11
      </p>
    </div>
  );
}
