const base = import.meta.env.BASE_URL;

export default function Closing() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#0a0a0b] text-white font-body">
      <div className="absolute -bottom-[24vh] -right-[8vw] w-[46vw] h-[46vw] rounded-full bg-[#716beb] opacity-25 blur-[130px]" />
      <div className="absolute -top-[22vh] -left-[6vw] w-[32vw] h-[32vw] rounded-full bg-[#29274e] opacity-50 blur-[120px]" />
      <div className="absolute top-0 left-0 w-full h-[0.6vh] bg-gradient-to-r from-[#f4a425] via-[#716beb] to-[#716beb]" />

      <div className="absolute top-[7vh] left-[6vw] flex items-center gap-[1.2vw]">
        <img
          src={`${base}sa-logo.webp`}
          crossOrigin="anonymous"
          alt="Saerens Advertising"
          className="h-[5.2vh] w-auto [filter:brightness(0)_invert(1)]"
        />
        <div className="flex flex-col leading-tight">
          <span className="font-display font-bold tracking-[0.16em] text-[1.25vw]">
            SAERENS ADVERTISING
          </span>
          <span className="text-[#9a98c7] text-[0.95vw] tracking-[0.08em]">
            Van clicks naar klanten
          </span>
        </div>
      </div>

      <div className="absolute left-[6vw] top-[36vh] max-w-[78vw]">
        <p className="text-[#f4a425] text-[1.3vw] font-semibold tracking-[0.34em] uppercase mb-[2.4vh]">
          Volgende stap
        </p>
        <h2 className="font-display font-extrabold text-[3.8vw] leading-[1.05] tracking-tight max-w-[74vw] text-balance">
          Terug naar conversiegericht bieden en de bewezen structuur
        </h2>
        <p className="text-[#c9c8d6] text-[1.8vw] font-light mt-[3.5vh] max-w-[62vw] leading-[1.45] text-pretty">
          Daarna meten en sturen we de leadkost opnieuw omlaag — met
          maandelijkse, transparante opvolging.
        </p>
      </div>

      <div className="absolute bottom-[5vh] left-[6vw] right-[6vw] flex items-end justify-between">
        <div>
          <p className="text-white text-[1.4vw] font-semibold">Axel Saerens</p>
          <p className="text-[#9a98c7] text-[1.2vw]">
            axel@saerensadvertising.com · saerensadvertising.com
          </p>
        </div>
        <p className="text-[#6b6b72] text-[1.1vw]">9 juni 2026 · 11 / 11</p>
      </div>
    </div>
  );
}
