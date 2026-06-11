export default function KpiTabel() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Kerncijfers · [[period.vergelijking]]
        </p>
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[70vw] text-balance">
          [Kernboodschap kerncijfers]
        </h2>
      </div>

      <div className="absolute top-[26vh] left-[6vw] right-[6vw]">
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] border-b-2 border-[#1a1a22] pb-[1.1vh] text-muted text-[1.05vw] uppercase tracking-[0.12em]">
          <span>Statistiek</span>
          <span className="text-right">[[period.aYear]]</span>
          <span className="text-right">[[period.bYear]]</span>
          <span className="text-right">Verschil</span>
        </div>

        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">Kosten</span>
          <span className="text-right text-muted">[[kpi.kosten.a]]</span>
          <span className="text-right font-semibold">[[kpi.kosten.b]]</span>
          <span className="text-right text-[#33333c]">[[kpi.kosten.delta]]</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">Vertoningen</span>
          <span className="text-right text-muted">[[kpi.vertoningen.a]]</span>
          <span className="text-right font-semibold">[[kpi.vertoningen.b]]</span>
          <span className="text-right text-[#33333c]">[[kpi.vertoningen.delta]]</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">Klikken</span>
          <span className="text-right text-muted">[[kpi.klikken.a]]</span>
          <span className="text-right font-semibold">[[kpi.klikken.b]]</span>
          <span className="text-right text-[#33333c]">[[kpi.klikken.delta]]</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">CTR</span>
          <span className="text-right text-muted">[[kpi.ctr.a]]</span>
          <span className="text-right font-semibold">[[kpi.ctr.b]]</span>
          <span className="text-right text-[#33333c]">[[kpi.ctr.delta]]</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">Gem. CPC</span>
          <span className="text-right text-muted">[[kpi.gemCpc.a]]</span>
          <span className="text-right font-semibold">[[kpi.gemCpc.b]]</span>
          <span className="text-right text-[#33333c]">[[kpi.gemCpc.delta]]</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] bg-[#f9ecea] text-[1.55vw]">
          <span className="font-semibold">Conversies</span>
          <span className="text-right text-muted">[[kpi.conversies.a]]</span>
          <span className="text-right font-bold">[[kpi.conversies.b]]</span>
          <span className="text-right font-bold text-[#c0392b]">[[kpi.conversies.delta]]</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] bg-[#f9ecea] text-[1.55vw]">
          <span className="font-semibold">Conversiewaarde</span>
          <span className="text-right text-muted">[[kpi.conversiewaarde.a]]</span>
          <span className="text-right font-bold">[[kpi.conversiewaarde.b]]</span>
          <span className="text-right font-bold text-[#c0392b]">[[kpi.conversiewaarde.delta]]</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">Kost per conversie</span>
          <span className="text-right text-muted">[[kpi.kostPerConversie.a]]</span>
          <span className="text-right font-semibold">[[kpi.kostPerConversie.b]]</span>
          <span className="text-right text-muted">[[kpi.kostPerConversie.delta]]</span>
        </div>
      </div>

      <p className="absolute bottom-[8.5vh] left-[6vw] right-[6vw] text-muted text-[1.15vw] text-pretty">
        [Eén regel context bij de tabel: leg een opvallende verschuiving uit of
        verwijs naar een meet-kwestie, en kondig de volgende slide aan.]
      </p>
      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald [[meta.opgehaald]] · periode [[period.rangeShort]]
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        04 / 11
      </p>
    </div>
  );
}
