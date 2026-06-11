export default function Grafiek() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Trend in beeld
        </p>
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[70vw] text-balance">
          [Kernboodschap trend over drie kwartalen]
        </h2>
      </div>

      <div className="absolute top-[30vh] left-[6vw] right-[6vw] grid grid-cols-2 gap-[5vw]">
        <div className="bg-white rounded-[1vw] border border-[#e4e2ee] px-[3vw] pt-[3vh] pb-[2.5vh]">
          <p className="text-text font-display font-bold text-[1.5vw] mb-[2.5vh]">
            Conversies
          </p>
          <div className="flex items-end justify-center gap-[3.5vw] h-[40vh]">
            <div className="flex flex-col items-center justify-end h-full">
              <span className="text-muted text-[1.3vw] font-semibold mb-[1vh]">
                [[kpi.conversies.yoyQ]]
              </span>
              <div className="w-[5vw] h-[24vh] bg-[#d8d6f6] rounded-t-[0.4vw]" />
              <span className="text-muted text-[1.1vw] mt-[1.2vh]">[[period.yoyLabel]]</span>
            </div>
            <div className="flex flex-col items-center justify-end h-full">
              <span className="text-muted text-[1.3vw] font-semibold mb-[1vh]">
                [[kpi.conversies.prevQ]]
              </span>
              <div className="w-[5vw] h-[30vh] bg-[#c9c6f2] rounded-t-[0.4vw]" />
              <span className="text-muted text-[1.1vw] mt-[1.2vh]">[[period.qoqLabel]]</span>
            </div>
            <div className="flex flex-col items-center justify-end h-full">
              <span className="text-text text-[1.3vw] font-bold mb-[1vh]">
                [[kpi.conversies.q]]
              </span>
              <div className="w-[5vw] h-[37vh] bg-[#716beb] rounded-t-[0.4vw]" />
              <span className="text-text text-[1.1vw] font-semibold mt-[1.2vh]">
                [[period.kwartaal]]
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[1vw] border border-[#e4e2ee] px-[3vw] pt-[3vh] pb-[2.5vh]">
          <p className="text-text font-display font-bold text-[1.5vw] mb-[2.5vh]">
            Conversiewaarde
          </p>
          <div className="flex items-end justify-center gap-[3.5vw] h-[40vh]">
            <div className="flex flex-col items-center justify-end h-full">
              <span className="text-muted text-[1.3vw] font-semibold mb-[1vh]">
                [[kpi.conversiewaarde.yoyQ]]
              </span>
              <div className="w-[5vw] h-[22vh] bg-[#d8d6f6] rounded-t-[0.4vw]" />
              <span className="text-muted text-[1.1vw] mt-[1.2vh]">[[period.yoyLabel]]</span>
            </div>
            <div className="flex flex-col items-center justify-end h-full">
              <span className="text-muted text-[1.3vw] font-semibold mb-[1vh]">
                [[kpi.conversiewaarde.prevQ]]
              </span>
              <div className="w-[5vw] h-[29vh] bg-[#c9c6f2] rounded-t-[0.4vw]" />
              <span className="text-muted text-[1.1vw] mt-[1.2vh]">[[period.qoqLabel]]</span>
            </div>
            <div className="flex flex-col items-center justify-end h-full">
              <span className="text-text text-[1.3vw] font-bold mb-[1vh]">
                [[kpi.conversiewaarde.q]]
              </span>
              <div className="w-[5vw] h-[36vh] bg-[#716beb] rounded-t-[0.4vw]" />
              <span className="text-text text-[1.1vw] font-semibold mt-[1.2vh]">
                [[period.kwartaal]]
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="absolute bottom-[8.5vh] left-[6vw] right-[6vw] text-muted text-[1.05vw] text-pretty">
        [Eén regel die de trend duidt: wat de drie kwartalen samen vertellen.
        Balkhoogtes hier zijn illustratief — pas ze aan op de echte verhouding.]
      </p>
      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald [[meta.opgehaald]] · periode [[period.kwartaal]]
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        06 / 09
      </p>
    </div>
  );
}
