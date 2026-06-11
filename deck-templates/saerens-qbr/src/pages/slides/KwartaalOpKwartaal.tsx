export default function KwartaalOpKwartaal() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Kwartaal-op-kwartaal · [[period.qoqLabel]] → [[period.kwartaal]]
        </p>
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[70vw] text-balance">
          [Kernboodschap kwartaal-op-kwartaal]
        </h2>
      </div>

      <div className="absolute top-[26vh] left-[6vw] right-[6vw]">
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] border-b-2 border-[#1a1a22] pb-[1.1vh] text-muted text-[1.05vw] uppercase tracking-[0.12em]">
          <span>Statistiek</span>
          <span className="text-right">[[period.qoqLabel]]</span>
          <span className="text-right">[[period.kwartaal]]</span>
          <span className="text-right">QoQ</span>
        </div>

        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">Kosten</span>
          <span className="text-right text-muted">[[kpi.kosten.prevQ]]</span>
          <span className="text-right font-semibold">[[kpi.kosten.q]]</span>
          <span className="text-right text-[#33333c]">[[kpi.kosten.qoq]]</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">Vertoningen</span>
          <span className="text-right text-muted">[[kpi.vertoningen.prevQ]]</span>
          <span className="text-right font-semibold">[[kpi.vertoningen.q]]</span>
          <span className="text-right text-[#33333c]">[[kpi.vertoningen.qoq]]</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">Klikken</span>
          <span className="text-right text-muted">[[kpi.klikken.prevQ]]</span>
          <span className="text-right font-semibold">[[kpi.klikken.q]]</span>
          <span className="text-right text-[#33333c]">[[kpi.klikken.qoq]]</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">CTR</span>
          <span className="text-right text-muted">[[kpi.ctr.prevQ]]</span>
          <span className="text-right font-semibold">[[kpi.ctr.q]]</span>
          <span className="text-right text-[#33333c]">[[kpi.ctr.qoq]]</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">Gem. CPC</span>
          <span className="text-right text-muted">[[kpi.gemCpc.prevQ]]</span>
          <span className="text-right font-semibold">[[kpi.gemCpc.q]]</span>
          <span className="text-right text-[#33333c]">[[kpi.gemCpc.qoq]]</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] bg-[#f9ecea] text-[1.55vw]">
          <span className="font-semibold">Conversies</span>
          <span className="text-right text-muted">[[kpi.conversies.prevQ]]</span>
          <span className="text-right font-bold">[[kpi.conversies.q]]</span>
          <span className="text-right font-bold text-primary">[[kpi.conversies.qoq]]</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] bg-[#f9ecea] text-[1.55vw]">
          <span className="font-semibold">Conversiewaarde</span>
          <span className="text-right text-muted">[[kpi.conversiewaarde.prevQ]]</span>
          <span className="text-right font-bold">[[kpi.conversiewaarde.q]]</span>
          <span className="text-right font-bold text-primary">[[kpi.conversiewaarde.qoq]]</span>
        </div>
        <div className="grid grid-cols-[2.4fr_1fr_1fr_1.2fr] items-center py-[1.0vh] border-b border-[#e4e2ee] text-[1.55vw]">
          <span className="font-medium">Kost per conversie</span>
          <span className="text-right text-muted">[[kpi.kostPerConversie.prevQ]]</span>
          <span className="text-right font-semibold">[[kpi.kostPerConversie.q]]</span>
          <span className="text-right text-muted">[[kpi.kostPerConversie.qoq]]</span>
        </div>
      </div>

      <p className="absolute bottom-[8.5vh] left-[6vw] right-[6vw] text-muted text-[1.15vw] text-pretty">
        [Eén regel context bij de tabel: licht de opvallendste verschuiving
        tegenover vorig kwartaal toe en kondig de jaarvergelijking aan.]
      </p>
      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald [[meta.opgehaald]] · periode [[period.kwartaal]]
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        04 / 09
      </p>
    </div>
  );
}
