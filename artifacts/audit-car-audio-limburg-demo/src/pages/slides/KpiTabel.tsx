export default function KpiTabel() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Kerncijfers · 2026 vs 2025
        </p>
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[70vw] text-balance">
          [Kernboodschap kerncijfers]
        </h2>
      </div>

      <div className="absolute top-[26vh] left-[6vw] right-[6vw]">
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] border-b-2 border-[#1a1a22] pb-[1.1vh] text-muted text-[1.05vw] uppercase tracking-[0.12em]">
          <span>Statistiek</span>
          <span className="text-right">2025</span>
          <span className="text-right">2026</span>
          <span className="text-right">Verschil</span>
        </div>

        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">Kosten</span>
          <span className="text-right text-muted">€1.920,46</span>
          <span className="text-right font-semibold">€2.310,49</span>
          <span className="text-right text-[#33333c]">+20%</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">Vertoningen</span>
          <span className="text-right text-muted">332.768</span>
          <span className="text-right font-semibold">472.052</span>
          <span className="text-right text-[#33333c]">+42%</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">Klikken</span>
          <span className="text-right text-muted">6.018</span>
          <span className="text-right font-semibold">7.373</span>
          <span className="text-right text-[#33333c]">+23%</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">CTR</span>
          <span className="text-right text-muted">1,81%</span>
          <span className="text-right font-semibold">1,56%</span>
          <span className="text-right text-[#33333c]">−0,25 pp</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">Gem. CPC</span>
          <span className="text-right text-muted">€0,32</span>
          <span className="text-right font-semibold">€0,31</span>
          <span className="text-right text-[#33333c]">−2%</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] bg-[#f9ecea] text-[1.55vw]">
          <span className="font-semibold">Conversies</span>
          <span className="text-right text-muted">31</span>
          <span className="text-right font-bold">1</span>
          <span className="text-right font-bold text-[#c0392b]">−97%</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] bg-[#f9ecea] text-[1.55vw]">
          <span className="font-semibold">Conversiewaarde</span>
          <span className="text-right text-muted">€626,90</span>
          <span className="text-right font-bold">€179,00</span>
          <span className="text-right font-bold text-[#c0392b]">−71%</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">Kost per conversie</span>
          <span className="text-right text-muted">€61,95</span>
          <span className="text-right font-semibold">€2.310,49</span>
          <span className="text-right text-muted">niet bruikbaar</span>
        </div>
      </div>

      <p className="absolute bottom-[8.5vh] left-[6vw] right-[6vw] text-muted text-[1.15vw] text-pretty">
        [Eén regel context bij de tabel: leg een opvallende verschuiving uit of
        verwijs naar een meet-kwestie, en kondig de volgende slide aan.]
      </p>
      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald 12 juni 2026 · periode 1 jan – 12 jun
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        04 / 11
      </p>
    </div>
  );
}
