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
          [Kernboodschap van het kwartaal in één zin]
        </h2>
      </div>

      <div className="absolute top-[35vh] left-[6vw] w-[45vw]">
        <p className="text-[1.65vw] leading-[1.55] text-[#33333c] text-pretty">
          [Alinea 1 — schets het kwartaal: wat ging vooruit ten opzichte van
          vorig kwartaal en vorig jaar, en waar zit de grootste verschuiving.
          Schrijf nuchter en verwijs naar de cijfers rechts.]
        </p>
        <p className="text-[1.65vw] leading-[1.55] text-[#33333c] mt-[3vh] text-pretty">
          [Alinea 2 — het reële signaal achter de cijfers: wat moet de klant
          écht onthouden, en wat is de focus voor volgend kwartaal. Houd het
          eerlijk en zonder jargon.]
        </p>
      </div>

      <div className="absolute top-[35vh] right-[6vw] w-[40vw] grid grid-cols-2 gap-[1.4vw]">
        <div className="bg-white rounded-[0.8vw] border border-[#e4e2ee] p-[1.7vw]">
          <p className="text-muted text-[0.95vw] uppercase tracking-[0.14em]">
            Kosten
          </p>
          <p className="font-display font-extrabold text-[2.7vw] text-text mt-[0.4vh] leading-none">
            €1.284,31
          </p>
          <p className="text-muted text-[1.05vw] mt-[1vh]">
            QoQ +27% · JoJ +8%
          </p>
        </div>
        <div className="bg-white rounded-[0.8vw] border border-[#e4e2ee] p-[1.7vw]">
          <p className="text-muted text-[0.95vw] uppercase tracking-[0.14em]">
            Klikken
          </p>
          <p className="font-display font-extrabold text-[2.7vw] text-text mt-[0.4vh] leading-none">
            4.351
          </p>
          <p className="text-muted text-[1.05vw] mt-[1vh]">
            QoQ +37% · JoJ +12%
          </p>
        </div>
        <div className="bg-white rounded-[0.8vw] border border-[#e4e2ee] p-[1.7vw]">
          <p className="text-muted text-[0.95vw] uppercase tracking-[0.14em]">
            Conversies
          </p>
          <p className="font-display font-extrabold text-[2.7vw] text-text mt-[0.4vh] leading-none">
            1
          </p>
          <p className="text-muted text-[1.05vw] mt-[1vh]">
            QoQ −75% · JoJ −96%
          </p>
        </div>
        <div className="bg-white rounded-[0.8vw] border border-[#e4e2ee] p-[1.7vw]">
          <p className="text-muted text-[0.95vw] uppercase tracking-[0.14em]">
            Conversiewaarde
          </p>
          <p className="font-display font-extrabold text-[2.7vw] text-text mt-[0.4vh] leading-none">
            €179,00
          </p>
          <p className="text-muted text-[1.05vw] mt-[1vh]">
            QoQ n.v.t. · JoJ −33%
          </p>
        </div>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald 11 juni 2026 · periode Q1 2026
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        02 / 09
      </p>
    </div>
  );
}
