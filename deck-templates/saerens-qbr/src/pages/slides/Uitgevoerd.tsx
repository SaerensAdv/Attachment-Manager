export default function Uitgevoerd() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Uitgevoerd dit kwartaal
        </p>
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[70vw] text-balance">
          [Kernboodschap: wat we dit kwartaal hebben gedaan]
        </h2>
      </div>

      <div className="absolute top-[28vh] left-[6vw] w-[50vw] flex flex-col gap-[2.4vh]">
        <div className="flex gap-[1.4vw]">
          <span className="text-primary font-display font-extrabold text-[1.8vw] leading-none">01</span>
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            [Eerste uitgevoerde actie en het concrete effect ervan.]
          </p>
        </div>
        <div className="flex gap-[1.4vw]">
          <span className="text-primary font-display font-extrabold text-[1.8vw] leading-none">02</span>
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            [Tweede uitgevoerde actie en het concrete effect ervan.]
          </p>
        </div>
        <div className="flex gap-[1.4vw]">
          <span className="text-primary font-display font-extrabold text-[1.8vw] leading-none">03</span>
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            [Derde uitgevoerde actie en het concrete effect ervan.]
          </p>
        </div>
        <div className="flex gap-[1.4vw]">
          <span className="text-primary font-display font-extrabold text-[1.8vw] leading-none">04</span>
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            [Vierde uitgevoerde actie en het concrete effect ervan.]
          </p>
        </div>
      </div>

      <div className="absolute top-[28vh] right-[6vw] w-[32vw] bg-[#1a1a22] text-white rounded-[1vw] p-[2.4vw]">
        <p className="text-accent text-[1vw] font-semibold tracking-[0.22em] uppercase mb-[1.6vh]">
          Grootste impact
        </p>
        <p className="text-[1.7vw] leading-[1.4] font-light text-pretty">
          [Beschrijf de wijziging met de grootste impact dit kwartaal — wat er
          veranderde en wat het opleverde.]
        </p>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald [[meta.opgehaald]] · periode [[period.kwartaal]]
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        07 / 09
      </p>
    </div>
  );
}
