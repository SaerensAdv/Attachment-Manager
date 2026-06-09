const base = import.meta.env.BASE_URL;

export default function Cover() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#0a0a0b] text-white font-body">
      <div className="absolute -top-[22vh] -right-[8vw] w-[48vw] h-[48vw] rounded-full bg-[#716beb] opacity-25 blur-[130px]" />
      <div className="absolute -bottom-[26vh] -left-[6vw] w-[34vw] h-[34vw] rounded-full bg-[#29274e] opacity-50 blur-[120px]" />
      <div className="absolute bottom-0 left-0 w-full h-[0.6vh] bg-gradient-to-r from-[#716beb] via-[#716beb] to-[#f4a425]" />

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

      <div className="absolute left-[6vw] top-[37vh] max-w-[84vw]">
        <p className="text-[#f4a425] text-[1.3vw] font-semibold tracking-[0.34em] uppercase mb-[2.4vh]">
          Google Ads-audit
        </p>
        <h1 className="font-display font-extrabold text-[5.6vw] leading-[0.98] tracking-tight text-balance">
          Car Audio Limburg Studio
        </h1>
        <div className="h-[0.5vh] w-[13vw] bg-[#716beb] mt-[3vh] mb-[3vh]" />
        <p className="text-[#c9c8d6] text-[1.9vw] font-light">
          Prestatie-analyse · 1 januari – 9 juni · 2026 vs 2025
        </p>
      </div>

      <div className="absolute bottom-[5vh] left-[6vw] right-[6vw] flex items-end justify-between">
        <p className="text-[#6b6b72] text-[1.1vw]">
          Vertrouwelijk · Opgesteld 9 juni 2026
        </p>
        <p className="text-[#6b6b72] text-[1.1vw]">
          Google Ads-account 544-227-3794
        </p>
      </div>
    </div>
  );
}
