export default function Aanbevelingen() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Aanbevelingen
        </p>
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[72vw] text-balance">
          Wat we aanpakken, in volgorde van prioriteit
        </h2>
      </div>

      <div className="absolute top-[28vh] left-[6vw] right-[6vw]">
        <div className="grid grid-cols-[1.1fr_3.1fr_2.2fr] border-b-2 border-[#1a1a22] pb-[1.1vh] text-muted text-[1vw] uppercase tracking-[0.12em]">
          <span>Prioriteit</span>
          <span>Actie</span>
          <span>Verwacht effect</span>
        </div>

        <div className="grid grid-cols-[1.1fr_3.1fr_2.2fr] items-center py-[1.7vh] border-b border-[#e4e2ee] text-[1.35vw]">
          <span>
            <span className="bg-accent text-[#1a1a22] rounded-full px-[1.1vw] py-[0.5vh] text-[1vw] font-semibold">
              Hoog
            </span>
          </span>
          <span className="pr-[1.5vw] text-pretty">
            Schakel terug naar conversiegericht bieden (Doel CPA) in plaats van
            Max. clicks.
          </span>
          <span className="text-muted text-pretty">
            Leadkost terug richting het niveau van 2025 (€22–25).
          </span>
        </div>

        <div className="grid grid-cols-[1.1fr_3.1fr_2.2fr] items-center py-[1.7vh] border-b border-[#e4e2ee] text-[1.35vw]">
          <span>
            <span className="bg-accent text-[#1a1a22] rounded-full px-[1.1vw] py-[0.5vh] text-[1vw] font-semibold">
              Hoog
            </span>
          </span>
          <span className="pr-[1.5vw] text-pretty">
            Heractiveer of consolideer de bewezen campagnes (NL, BE, Doel CPA).
          </span>
          <span className="text-muted text-pretty">
            Meer conversies tegen lagere kost per lead.
          </span>
        </div>

        <div className="grid grid-cols-[1.1fr_3.1fr_2.2fr] items-center py-[1.7vh] border-b border-[#e4e2ee] text-[1.35vw]">
          <span>
            <span className="bg-accent text-[#1a1a22] rounded-full px-[1.1vw] py-[0.5vh] text-[1vw] font-semibold">
              Hoog
            </span>
          </span>
          <span className="pr-[1.5vw] text-pretty">
            Stem negatieve zoekwoorden af met het zusteraccount om dubbele
            CarPlay-biedingen te stoppen.
          </span>
          <span className="text-muted text-pretty">
            Lagere klikprijs, minder onderlinge concurrentie.
          </span>
        </div>

        <div className="grid grid-cols-[1.1fr_3.1fr_2.2fr] items-center py-[1.7vh] border-b border-[#e4e2ee] text-[1.35vw]">
          <span>
            <span className="bg-[#e4e2ee] text-[#1a1a22] rounded-full px-[1.1vw] py-[0.5vh] text-[1vw] font-semibold">
              Midden
            </span>
          </span>
          <span className="pr-[1.5vw] text-pretty">
            Sluit de CarPlay-termen zonder conversies uit (€79,98).
          </span>
          <span className="text-muted text-pretty">
            Budget naar zoektermen die wél leads opleveren.
          </span>
        </div>

        <div className="grid grid-cols-[1.1fr_3.1fr_2.2fr] items-center py-[1.7vh] border-b border-[#e4e2ee] text-[1.35vw]">
          <span>
            <span className="bg-[#e4e2ee] text-[#1a1a22] rounded-full px-[1.1vw] py-[0.5vh] text-[1vw] font-semibold">
              Midden
            </span>
          </span>
          <span className="pr-[1.5vw] text-pretty">
            Stel conversiewaarden in zodat ROAS opnieuw betekenis krijgt.
          </span>
          <span className="text-muted text-pretty">
            Waardegericht sturen in plaats van enkel op klikken.
          </span>
        </div>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald 9 juni 2026 · periode 1 jan – 9 jun
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        09 / 10
      </p>
    </div>
  );
}
