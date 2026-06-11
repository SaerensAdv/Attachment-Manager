export default function Verspilling() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Bevinding 3 · [thema]
        </p>
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[72vw] text-balance">
          [Kernboodschap bevinding 3]
        </h2>
      </div>

      <div className="absolute top-[31vh] left-[6vw] w-[44vw]">
        <div className="grid grid-cols-[2.6fr_1fr_1fr] border-b-2 border-[#1a1a22] pb-[1.1vh] text-muted text-[1vw] uppercase tracking-[0.12em]">
          <span>Zoekterm ([periode])</span>
          <span className="text-right">Kosten</span>
          <span className="text-right">Conv.</span>
        </div>
        <div className="grid grid-cols-[2.6fr_1fr_1fr] items-center py-[1.55vh] border-b border-[#e4e2ee] text-[1.45vw]">
          <span>[zoekterm]</span>
          <span className="text-right font-semibold">[€]</span>
          <span className="text-right text-[#c0392b] font-semibold">[n]</span>
        </div>
        <div className="grid grid-cols-[2.6fr_1fr_1fr] items-center py-[1.55vh] border-b border-[#e4e2ee] text-[1.45vw]">
          <span>[zoekterm]</span>
          <span className="text-right font-semibold">[€]</span>
          <span className="text-right text-[#c0392b] font-semibold">[n]</span>
        </div>
        <div className="grid grid-cols-[2.6fr_1fr_1fr] items-center py-[1.55vh] border-b border-[#e4e2ee] text-[1.45vw]">
          <span>[zoekterm]</span>
          <span className="text-right font-semibold">[€]</span>
          <span className="text-right text-[#c0392b] font-semibold">[n]</span>
        </div>
        <div className="grid grid-cols-[2.6fr_1fr_1fr] items-center py-[1.55vh] border-b border-[#e4e2ee] text-[1.45vw]">
          <span>[zoekterm]</span>
          <span className="text-right font-semibold">[€]</span>
          <span className="text-right text-[#c0392b] font-semibold">[n]</span>
        </div>
        <div className="grid grid-cols-[2.6fr_1fr_1fr] items-center py-[1.55vh] border-b border-[#e4e2ee] text-[1.45vw]">
          <span>[zoekterm]</span>
          <span className="text-right font-semibold">[€]</span>
          <span className="text-right text-[#c0392b] font-semibold">[n]</span>
        </div>
        <p className="text-muted text-[1.25vw] mt-[2vh]">
          [Samenvattende regel: totale kost van deze termen en hun rendement.]
        </p>
      </div>

      <div className="absolute top-[31vh] right-[6vw] w-[33vw] bg-white rounded-[1vw] border border-[#e4e2ee] p-[2.4vw]">
        <p className="text-primary text-[1vw] font-bold uppercase tracking-[0.16em] mb-[1.6vh]">
          [Neventhema]
        </p>
        <p className="text-[1.5vw] font-display font-bold leading-[1.3] text-text text-pretty">
          [Kernpunt van het neventhema]
        </p>
        <p className="text-[1.35vw] text-muted leading-[1.45] mt-[2vh] text-pretty">
          [Korte toelichting met het concrete gevolg voor de klant.]
        </p>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald [datum] · periode [periode]
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        09 / 11
      </p>
    </div>
  );
}
