export default function Oordeel() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase">
          Kernconclusie
        </p>
      </div>

      <div className="absolute top-[20vh] left-[6vw] right-[6vw]">
        <h2 className="font-display font-extrabold text-[4.2vw] leading-[1.02] tracking-tight max-w-[74vw] text-balance">
          [Kernconclusie in één zin]
        </h2>
        <p className="mt-[3vh] text-[1.85vw] text-muted max-w-[64vw] leading-[1.45] text-pretty">
          [Eén korte alinea die de conclusie onderbouwt: de belangrijkste
          verschuiving dit kwartaal en wat die betekent. Eerlijk, nuchter, geen
          jargon.]
        </p>
      </div>

      <div className="absolute bottom-[14vh] left-[6vw] right-[6vw] flex items-end justify-between gap-[4vw]">
        <div>
          <p className="text-muted text-[1.1vw] uppercase tracking-[0.16em] mb-[1vh]">
            [[oordeel.kernmetriekLabel]] · [[period.kwartaal]]
          </p>
          <p className="font-display font-extrabold text-[5.4vw] leading-none">
            [[oordeel.q]]
          </p>
        </div>
        <div className="flex flex-col gap-[1.4vh] mb-[0.5vh]">
          <div className="bg-accent text-[#1a1a22] rounded-full px-[1.8vw] py-[1.1vh] font-display font-semibold text-[1.2vw]">
            QoQ ([[period.qoqLabel]]): [[oordeel.qoq]] · [[oordeel.qoqStatus]]
          </div>
          <div className="bg-[#e4e2ee] text-[#1a1a22] rounded-full px-[1.8vw] py-[1.1vh] font-display font-semibold text-[1.2vw]">
            JoJ ([[period.yoyLabel]]): [[oordeel.yoy]] · [[oordeel.yoyStatus]]
          </div>
        </div>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald [[meta.opgehaald]] · periode [[period.kwartaal]]
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        03 / 09
      </p>
    </div>
  );
}
