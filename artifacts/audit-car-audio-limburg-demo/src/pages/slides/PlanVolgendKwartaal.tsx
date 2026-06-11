export default function PlanVolgendKwartaal() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Volgend kwartaal
        </p>
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[70vw] text-balance">
          Plan en doelstellingen
        </h2>
      </div>

      <div className="absolute top-[27vh] left-[6vw] right-[6vw]">
        <div className="grid grid-cols-[1fr_2.4fr_2fr] border-b-2 border-[#1a1a22] pb-[1.1vh] text-muted text-[1.05vw] uppercase tracking-[0.12em]">
          <span>Prioriteit</span>
          <span>Actie</span>
          <span>Beoogd effect</span>
        </div>

        <div className="grid grid-cols-[1fr_2.4fr_2fr] items-center py-[1.5vh] border-b border-[#e4e2ee] text-[1.5vw]">
          <span>
            <span className="bg-primary text-white rounded-full px-[1.2vw] py-[0.5vh] text-[1vw] font-semibold">
              Hoog
            </span>
          </span>
          <span className="text-[#33333c] pr-[2vw]">[Eerste actie volgend kwartaal]</span>
          <span className="text-muted pr-[1vw]">[Beoogd effect]</span>
        </div>
        <div className="grid grid-cols-[1fr_2.4fr_2fr] items-center py-[1.5vh] border-b border-[#e4e2ee] text-[1.5vw]">
          <span>
            <span className="bg-primary text-white rounded-full px-[1.2vw] py-[0.5vh] text-[1vw] font-semibold">
              Hoog
            </span>
          </span>
          <span className="text-[#33333c] pr-[2vw]">[Tweede actie volgend kwartaal]</span>
          <span className="text-muted pr-[1vw]">[Beoogd effect]</span>
        </div>
        <div className="grid grid-cols-[1fr_2.4fr_2fr] items-center py-[1.5vh] border-b border-[#e4e2ee] text-[1.5vw]">
          <span>
            <span className="bg-accent text-[#1a1a22] rounded-full px-[1.2vw] py-[0.5vh] text-[1vw] font-semibold">
              Midden
            </span>
          </span>
          <span className="text-[#33333c] pr-[2vw]">[Derde actie volgend kwartaal]</span>
          <span className="text-muted pr-[1vw]">[Beoogd effect]</span>
        </div>
        <div className="grid grid-cols-[1fr_2.4fr_2fr] items-center py-[1.5vh] border-b border-[#e4e2ee] text-[1.5vw]">
          <span>
            <span className="bg-accent text-[#1a1a22] rounded-full px-[1.2vw] py-[0.5vh] text-[1vw] font-semibold">
              Midden
            </span>
          </span>
          <span className="text-[#33333c] pr-[2vw]">[Vierde actie volgend kwartaal]</span>
          <span className="text-muted pr-[1vw]">[Beoogd effect]</span>
        </div>
      </div>

      <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] bg-[#f1f0f8] rounded-[0.8vw] px-[2vw] py-[1.8vh]">
        <p className="text-[#33333c] text-[1.2vw] leading-[1.4] text-pretty">
          <span className="font-semibold">Doelstellingen.</span> Concrete
          streefcijfers leggen we samen met u vast op basis van budget en
          ambitie — daarom houden we de getallen hier bewust open.
        </p>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald 11 juni 2026 · periode Q1 2026
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        08 / 09
      </p>
    </div>
  );
}
