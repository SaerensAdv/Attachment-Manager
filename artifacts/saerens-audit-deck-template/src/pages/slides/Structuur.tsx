export default function Structuur() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Bevinding 2 · [thema]
        </p>
        <h2 className="font-display font-extrabold text-[3.1vw] leading-[1.06] tracking-tight max-w-[78vw] text-balance">
          [Kernboodschap bevinding 2]
        </h2>
      </div>

      <div className="absolute top-[31vh] left-[6vw] w-[41vw]">
        <p className="text-text font-display font-bold text-[1.4vw] uppercase tracking-[0.12em] mb-[2vh]">
          Actief in [periode]
        </p>
        <div className="bg-white rounded-[0.9vw] border border-[#e4e2ee] divide-y divide-[#e4e2ee]">
          <div className="flex items-center justify-between px-[1.8vw] py-[2.1vh]">
            <span className="text-[1.5vw] font-medium">[Campagne]</span>
            <span className="text-[1.4vw] text-muted">[€] · [n] conv.</span>
          </div>
          <div className="flex items-center justify-between px-[1.8vw] py-[2.1vh]">
            <span className="text-[1.5vw] font-medium">[Campagne]</span>
            <span className="text-[1.4vw] text-muted">[€] · [n] conv.</span>
          </div>
          <div className="flex items-center justify-between px-[1.8vw] py-[2.1vh]">
            <span className="text-[1.5vw] font-medium">[Campagne]</span>
            <span className="text-[1.4vw] text-muted">[€] · [n] conv.</span>
          </div>
        </div>
      </div>

      <div className="absolute top-[31vh] right-[6vw] w-[41vw]">
        <p className="text-text font-display font-bold text-[1.4vw] uppercase tracking-[0.12em] mb-[2vh]">
          Op pauze · [periode]
        </p>
        <div className="bg-white rounded-[0.9vw] border border-[#e4e2ee] divide-y divide-[#e4e2ee]">
          <div className="px-[1.8vw] py-[2.1vh]">
            <div className="flex items-center justify-between">
              <span className="text-[1.5vw] font-medium">[Campagne]</span>
              <span className="text-[1.4vw] font-semibold text-primary">
                CPA [€]
              </span>
            </div>
            <span className="text-[1.3vw] text-muted">[€] · [n] conv.</span>
          </div>
          <div className="px-[1.8vw] py-[2.1vh]">
            <div className="flex items-center justify-between">
              <span className="text-[1.5vw] font-medium">[Campagne]</span>
              <span className="text-[1.4vw] font-semibold text-primary">
                CPA [€]
              </span>
            </div>
            <span className="text-[1.3vw] text-muted">[€] · [n] conv.</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[10vh] left-[6vw] right-[6vw] bg-[#29274e] rounded-[0.9vw] px-[2.4vw] py-[2.6vh]">
        <p className="text-white text-[1.5vw] leading-[1.4] text-pretty">
          <span className="font-bold text-[#f4a425]">[Kerncijfer]</span>{" "}
          [Eén zin die de structuur-bevinding samenvat: waar het budget heen
          gaat versus waar de resultaten vandaan kwamen.]
        </p>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald [datum] · periode [periode]
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        08 / 11
      </p>
    </div>
  );
}
