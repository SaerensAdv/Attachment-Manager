export default function Verspilling() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Bevinding 3 · Verspilling
        </p>
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[72vw] text-balance">
          Budget lekt weg op brede CarPlay-zoektermen
        </h2>
      </div>

      <div className="absolute top-[31vh] left-[6vw] w-[44vw]">
        <div className="grid grid-cols-[2.6fr_1fr_1fr] border-b-2 border-[#1a1a22] pb-[1.1vh] text-muted text-[1vw] uppercase tracking-[0.12em]">
          <span>Zoekterm (2026)</span>
          <span className="text-right">Kosten</span>
          <span className="text-right">Conv.</span>
        </div>
        <div className="grid grid-cols-[2.6fr_1fr_1fr] items-center py-[1.55vh] border-b border-[#e4e2ee] text-[1.45vw]">
          <span>apple carplay inbouwen</span>
          <span className="text-right font-semibold">€116,30</span>
          <span className="text-right text-[#c0392b] font-semibold">0</span>
        </div>
        <div className="grid grid-cols-[2.6fr_1fr_1fr] items-center py-[1.55vh] border-b border-[#e4e2ee] text-[1.45vw]">
          <span>carplay inbouwen</span>
          <span className="text-right font-semibold">€74,82</span>
          <span className="text-right text-[#c0392b] font-semibold">0</span>
        </div>
        <div className="grid grid-cols-[2.6fr_1fr_1fr] items-center py-[1.55vh] border-b border-[#e4e2ee] text-[1.45vw]">
          <span>carplay installeren</span>
          <span className="text-right font-semibold">€44,23</span>
          <span className="text-right text-[#c0392b] font-semibold">0</span>
        </div>
        <div className="grid grid-cols-[2.6fr_1fr_1fr] items-center py-[1.55vh] border-b border-[#e4e2ee] text-[1.45vw]">
          <span>carplay laten inbouwen</span>
          <span className="text-right font-semibold">€19,21</span>
          <span className="text-right text-[#c0392b] font-semibold">0</span>
        </div>
        <div className="grid grid-cols-[2.6fr_1fr_1fr] items-center py-[1.55vh] border-b border-[#e4e2ee] text-[1.45vw]">
          <span>apple carplay laten inbouwen</span>
          <span className="text-right font-semibold">€18,22</span>
          <span className="text-right text-[#c0392b] font-semibold">0</span>
        </div>
        <p className="text-muted text-[1.25vw] mt-[2vh]">
          Top-5 CarPlay-termen samen: €272,78 — nul conversies.
        </p>
      </div>

      <div className="absolute top-[31vh] right-[6vw] w-[33vw] bg-white rounded-[1vw] border border-[#e4e2ee] p-[2.4vw]">
        <p className="text-primary text-[1vw] font-bold uppercase tracking-[0.16em] mb-[1.6vh]">
          Overlap tussen accounts
        </p>
        <p className="text-[1.5vw] font-display font-bold leading-[1.3] text-text text-pretty">
          Beide Saerens-accounts bieden op dezelfde CarPlay-termen
        </p>
        <p className="text-[1.35vw] text-muted leading-[1.45] mt-[2vh] text-pretty">
          In het zusteraccount (Studio) leveren ‘carplay inbouwen’ en ‘apple
          carplay inbouwen’ wél conversies; hier nul. De accounts beconcurreren
          elkaar en drijven zo de klikprijs op.
        </p>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald 9 juni 2026 · periode 1 jan – 9 jun
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        09 / 11
      </p>
    </div>
  );
}
