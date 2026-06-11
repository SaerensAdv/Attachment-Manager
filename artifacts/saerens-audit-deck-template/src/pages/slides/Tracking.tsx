export default function Tracking() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Bevinding 1 · [thema]
        </p>
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[70vw] text-balance">
          [Kernboodschap bevinding 1]
        </h2>
      </div>

      <div className="absolute top-[31vh] left-[6vw] w-[47vw]">
        <div className="flex items-start gap-[1.4vw] mb-[3vh]">
          <div className="w-[0.9vw] h-[0.9vw] bg-primary mt-[1vh] shrink-0" />
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            <span className="font-semibold text-text">
              [Kernpunt in vetgedrukt.]
            </span>{" "}
            [Onderbouwing met een concreet cijfer of feit.]
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw] mb-[3vh]">
          <div className="w-[0.9vw] h-[0.9vw] bg-primary mt-[1vh] shrink-0" />
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            <span className="font-semibold text-text">
              [Kernpunt in vetgedrukt.]
            </span>{" "}
            [Onderbouwing met een concreet cijfer of feit.]
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw] mb-[3vh]">
          <div className="w-[0.9vw] h-[0.9vw] bg-primary mt-[1vh] shrink-0" />
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            <span className="font-semibold text-text">
              [Kernpunt in vetgedrukt.]
            </span>{" "}
            [Onderbouwing met een concreet cijfer of feit.]
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw]">
          <div className="w-[0.9vw] h-[0.9vw] bg-primary mt-[1vh] shrink-0" />
          <p className="text-[1.55vw] leading-[1.4] text-[#33333c] text-pretty">
            <span className="font-semibold text-text">
              [Kernpunt in vetgedrukt.]
            </span>{" "}
            [Onderbouwing met een concreet cijfer of feit.]
          </p>
        </div>
      </div>

      <div className="absolute top-[31vh] right-[6vw] w-[33vw] bg-white rounded-[1vw] border-2 border-[#f4a425] p-[2.4vw]">
        <p className="text-[#33333c] text-[1vw] font-bold uppercase tracking-[0.16em] mb-[1.6vh]">
          Eerste actie · Hoog
        </p>
        <p className="text-[1.7vw] font-display font-bold leading-[1.25] text-text text-pretty">
          [Belangrijkste aanbeveling bij deze bevinding]
        </p>
        <p className="text-[1.4vw] text-muted leading-[1.45] mt-[2vh] text-pretty">
          [Verwacht effect — wat levert deze actie op.]
        </p>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald [[meta.opgehaald]] · periode [[period.rangeShort]]
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        07 / 11
      </p>
    </div>
  );
}
