export default function ConversiesPerActie() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg text-text font-body">
      <span className="absolute top-[5vh] right-[6vw] text-muted text-[1vw] tracking-[0.24em] font-display">
        SAERENS ADVERTISING
      </span>

      <div className="absolute top-[7vh] left-[6vw] right-[6vw]">
        <p className="text-primary text-[1.15vw] font-semibold tracking-[0.3em] uppercase mb-[1.6vh]">
          Conversies per actie · [vergelijking]
        </p>
        <h2 className="font-display font-extrabold text-[3.3vw] leading-[1.06] tracking-tight max-w-[72vw] text-balance">
          [Waarom de conversieteller veranderde]
        </h2>
      </div>

      <div className="absolute top-[26vh] left-[6vw] right-[6vw] grid grid-cols-2 gap-[4vw]">
        <div className="bg-white rounded-[1vw] border border-[#e4e2ee] p-[2.2vw]">
          <div className="flex items-baseline justify-between mb-[2vh]">
            <span className="font-display font-bold text-[1.9vw]">[Periode A]</span>
            <span className="text-muted text-[1vw] uppercase tracking-[0.14em]">
              [n] geteld als conversie
            </span>
          </div>
          <div className="flex items-center justify-between py-[1.3vh] border-b border-[#eee] text-[1.5vw]">
            <span>[Conversie-actie]</span>
            <span className="font-semibold">[n]</span>
          </div>
          <div className="flex items-center justify-between py-[1.3vh] text-[1.5vw]">
            <span>[Conversie-actie]</span>
            <span className="font-semibold">[n]</span>
          </div>
        </div>

        <div className="bg-white rounded-[1vw] border border-[#e4e2ee] p-[2.2vw]">
          <div className="flex items-baseline justify-between mb-[2vh]">
            <span className="font-display font-bold text-[1.9vw]">[Periode B]</span>
            <span className="text-muted text-[1vw] uppercase tracking-[0.14em]">
              [n] geteld als conversie
            </span>
          </div>
          <div className="flex items-center justify-between py-[1.3vh] text-[1.5vw]">
            <span>[Conversie-actie]</span>
            <span className="font-bold text-[#c0392b]">[n]</span>
          </div>
        </div>
      </div>

      <div className="absolute top-[57vh] left-[6vw] right-[6vw]">
        <p className="text-muted text-[0.95vw] uppercase tracking-[0.14em] mb-[1.2vh]">
          Ook gemeten, maar niet meegeteld in de kolom Conversies
        </p>
        <p className="text-[1.35vw] text-[#33333c] leading-[1.5] text-pretty">
          [Acties die wél gemeten worden maar niet als conversie tellen, met hun
          aantallen — bv. productweergaves, winkelwagen, checkouts, telefoonklikken.]
        </p>
        <p className="text-[1.35vw] text-[#33333c] leading-[1.5] mt-[2.4vh] max-w-[80vw] text-pretty">
          [Korte duiding: welke meet-keuzes of reële verschuivingen verklaren de
          beweging in de teller, en wat dat zegt over de meting zelf.]
        </p>
      </div>

      <p className="absolute bottom-[4vh] left-[6vw] text-muted text-[0.95vw]">
        Bron: Google Ads (read-only) · opgehaald [datum] · periode [periode]
      </p>
      <p className="absolute bottom-[4vh] right-[6vw] text-muted text-[1vw]">
        05 / 11
      </p>
    </div>
  );
}
