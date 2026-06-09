export default function Grafiek() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          De kloof in beeld
        </p>
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[70vw] text-balance">
          Minder conversies, en elke conversie kost meer
        </h2>
      </div>

      <div className="absolute top-[30vh] left-[6vw] right-[6vw] grid grid-cols-2 gap-[5vw]">
        <div className="bg-white rounded-[1vw] border border-[#e4e2ee] px-[3vw] pt-[3vh] pb-[2.5vh]">
          <p className="text-text font-display font-bold text-[1.5vw] mb-[2.5vh]">
            Gemeten conversies
          </p>
          <div className="flex items-end justify-center gap-[5vw] h-[40vh]">
            <div className="flex flex-col items-center justify-end h-full">
              <span className="text-muted text-[1.4vw] font-semibold mb-[1vh]">
                88
              </span>
              <div className="w-[6.5vw] h-[39vh] bg-[#c9c6f2] rounded-t-[0.4vw]" />
              <span className="text-muted text-[1.2vw] mt-[1.2vh]">2025</span>
            </div>
            <div className="flex flex-col items-center justify-end h-full">
              <span className="text-text text-[1.4vw] font-bold mb-[1vh]">
                45
              </span>
              <div className="w-[6.5vw] h-[20vh] bg-[#716beb] rounded-t-[0.4vw]" />
              <span className="text-text text-[1.2vw] font-semibold mt-[1.2vh]">
                2026
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[1vw] border border-[#e4e2ee] px-[3vw] pt-[3vh] pb-[2.5vh]">
          <p className="text-text font-display font-bold text-[1.5vw] mb-[2.5vh]">
            Kost per conversie
          </p>
          <div className="flex items-end justify-center gap-[5vw] h-[40vh]">
            <div className="flex flex-col items-center justify-end h-full">
              <span className="text-muted text-[1.4vw] font-semibold mb-[1vh]">
                €27,31
              </span>
              <div className="w-[6.5vw] h-[21vh] bg-[#c9c6f2] rounded-t-[0.4vw]" />
              <span className="text-muted text-[1.2vw] mt-[1.2vh]">2025</span>
            </div>
            <div className="flex flex-col items-center justify-end h-full">
              <span className="text-[#c0392b] text-[1.4vw] font-bold mb-[1vh]">
                €51,50
              </span>
              <div className="w-[6.5vw] h-[39vh] bg-[#c0392b] rounded-t-[0.4vw]" />
              <span className="text-text text-[1.2vw] font-semibold mt-[1.2vh]">
                2026
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald 9 juni 2026 · periode 1 jan – 9 jun
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        05 / 10
      </p>
    </div>
  );
}
