import React, { useState, useEffect } from "react";
import { ChevronDown, Play, Square, Download, Copy, Check, Clock, Edit2, Loader2, ArrowRight } from "lucide-react";

export function Newsroom() {
  const [isGenerating, setIsGenerating] = useState(true);
  const [elapsed, setElapsed] = useState(14);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      interval = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F4F4F0] text-[#1A1A1A] font-['Inter'] selection:bg-[#726CEA] selection:text-white flex flex-col md:flex-row">
      
      {/* LEFT COLUMN: OPDRACHTBUREAU */}
      <div className="w-full md:w-5/12 lg:w-4/12 border-r border-[#1A1A1A]/20 flex flex-col h-screen overflow-y-auto">
        
        {/* Masthead */}
        <div className="p-8 border-b border-[#1A1A1A]/20">
          <div className="flex justify-between items-start mb-12">
            <h1 className="font-['Playfair_Display'] text-4xl font-black tracking-tight leading-none uppercase">
              Saerens<br />Desk
            </h1>
            <div className="text-right">
              <div className="font-['Space_Mono'] text-xs uppercase tracking-widest text-[#1A1A1A]/50">Editie</div>
              <div className="font-['Playfair_Display'] text-xl italic">No. 042</div>
            </div>
          </div>
          
          <div className="flex items-center justify-between border-t border-b border-[#1A1A1A] py-2 mb-6">
            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">Opdrachtbureau</span>
            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-[#726CEA]">Live</span>
          </div>
        </div>

        {/* Form / Briefing */}
        <div className="p-8 flex-1 flex flex-col gap-10">
          
          <section className="space-y-4">
            <header className="flex items-baseline justify-between mb-2 border-b-2 border-[#1A1A1A] pb-1">
              <h2 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">I. Cliënt & Briefing</h2>
              <span className="font-['Space_Mono'] text-xs text-[#1A1A1A]/50">01</span>
            </header>
            
            <div className="space-y-6">
              <div>
                <label className="block font-['Space_Mono'] text-xs uppercase mb-2 tracking-wider text-[#1A1A1A]/70">Dossier</label>
                <div className="flex items-center justify-between p-3 border border-[#1A1A1A] bg-white cursor-pointer hover:bg-gray-50 transition-colors">
                  <span className="font-medium">Brouwerij De Vlaamse Leeuw</span>
                  <ChevronDown className="w-4 h-4 text-[#1A1A1A]/50" />
                </div>
              </div>

              <div>
                <label className="block font-['Space_Mono'] text-xs uppercase mb-2 tracking-wider text-[#1A1A1A]/70">Opdracht</label>
                <textarea 
                  className="w-full p-4 border border-[#1A1A1A] bg-white resize-none h-28 focus:outline-none focus:ring-1 focus:ring-[#726CEA] font-['Playfair_Display'] text-lg italic"
                  defaultValue="Schrijf een maandelijkse update-mail over de Google Ads-resultaten van vorige maand."
                />
              </div>

              <button className="w-full py-3 border border-[#1A1A1A] text-[#1A1A1A] font-['Space_Mono'] uppercase text-xs tracking-widest hover:bg-[#1A1A1A] hover:text-[#F4F4F0] transition-colors flex items-center justify-center gap-2">
                <span>Taak Herkennen</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </section>

          <section className="space-y-4">
            <header className="flex items-baseline justify-between mb-2 border-b-2 border-[#1A1A1A] pb-1">
              <h2 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">II. Redactieteam</h2>
              <span className="font-['Space_Mono'] text-xs text-[#1A1A1A]/50">02</span>
            </header>
            
            <div className="p-4 bg-white border border-[#1A1A1A] space-y-4 shadow-[4px_4px_0px_#1A1A1A]">
              <div className="flex items-center gap-3">
                <span className="bg-[#1A1A1A] text-[#F4F4F0] font-['Space_Mono'] text-[10px] px-2 py-1 uppercase tracking-widest">E-mail</span>
                <p className="font-medium text-sm">Update-mail geanalyseerd op basis van maandelijkse rapportage-standaarden.</p>
              </div>

              <div className="border-t border-[#1A1A1A]/20 pt-4 mt-2">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block font-['Space_Mono'] text-[10px] uppercase mb-1 text-[#1A1A1A]/50">Format</label>
                    <div className="text-sm font-medium border-b border-[#1A1A1A] pb-1 cursor-pointer flex justify-between items-center">
                      Client Email <ChevronDown className="w-3 h-3" />
                    </div>
                  </div>
                  <div>
                    <label className="block font-['Space_Mono'] text-[10px] uppercase mb-1 text-[#1A1A1A]/50">Lead</label>
                    <div className="text-sm font-medium border-b border-[#1A1A1A] pb-1 cursor-pointer flex justify-between items-center">
                      Client Success <ChevronDown className="w-3 h-3" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block font-['Space_Mono'] text-[10px] uppercase mb-2 text-[#1A1A1A]/50">Samenstelling</label>
                  
                  <div className="flex items-center gap-3 text-sm p-2 border-l-2 border-[#1A1A1A] bg-gray-50">
                    <span className="font-['Space_Mono'] text-xs text-[#1A1A1A]/50">01</span>
                    <span className="font-medium">Reporting Specialist</span>
                    <span className="ml-auto text-xs italic text-[#1A1A1A]/50">Data extractie</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm p-2 border-l-2 border-[#726CEA] bg-[#726CEA]/5">
                    <span className="font-['Space_Mono'] text-xs text-[#726CEA]">02</span>
                    <span className="font-medium text-[#726CEA]">Copywriter</span>
                    <span className="ml-auto text-xs italic text-[#726CEA]/70">Bezig...</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <header className="flex items-baseline justify-between mb-2 border-b-2 border-[#1A1A1A] pb-1">
              <h2 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">III. Parameters</h2>
              <span className="font-['Space_Mono'] text-xs text-[#1A1A1A]/50">03</span>
            </header>

            <div className="space-y-4">
              <div>
                <label className="block font-['Space_Mono'] text-[10px] uppercase mb-1 tracking-wider">Rapportageperiode</label>
                <input type="text" defaultValue="Mei 2024" className="w-full border-b border-[#1A1A1A] bg-transparent pb-1 text-sm focus:outline-none focus:border-[#726CEA]" />
              </div>
              <div>
                <label className="block font-['Space_Mono'] text-[10px] uppercase mb-1 tracking-wider">Kernboodschap</label>
                <input type="text" defaultValue="CPA is gedaald met 12%, budget optimaal benut." className="w-full border-b border-[#1A1A1A] bg-transparent pb-1 text-sm focus:outline-none focus:border-[#726CEA]" />
              </div>
              <div>
                <label className="block font-['Space_Mono'] text-[10px] uppercase mb-1 tracking-wider">Toon</label>
                <input type="text" defaultValue="Informatief maar enthousiast" className="w-full border-b border-[#1A1A1A] bg-transparent pb-1 text-sm focus:outline-none focus:border-[#726CEA]" />
              </div>
            </div>
          </section>

        </div>

        {/* Footer / Generate Action */}
        <div className="p-8 border-t border-[#1A1A1A]/20 bg-[#F4F4F0] sticky bottom-0">
          <button 
            onClick={() => setIsGenerating(!isGenerating)}
            className={`w-full py-4 uppercase font-['Space_Mono'] text-sm tracking-widest font-bold transition-all flex items-center justify-center gap-3 shadow-[4px_4px_0px_rgba(26,26,26,1)] active:shadow-none active:translate-x-1 active:translate-y-1 ${
              isGenerating ? "bg-[#726CEA] text-white border-2 border-[#726CEA] hover:bg-[#5b56bc]" : "bg-[#1A1A1A] text-[#F4F4F0] border-2 border-[#1A1A1A] hover:bg-black"
            }`}
          >
            {isGenerating ? (
              <>
                <Square className="w-4 h-4 fill-current" /> Stop Persen
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" /> Drukken
              </>
            )}
          </button>
        </div>
      </div>

      {/* RIGHT COLUMN: DRUKPROEF */}
      <div className="w-full md:w-7/12 lg:w-8/12 bg-white h-screen overflow-y-auto relative">
        
        {/* Top bar (Status) */}
        <div className="sticky top-0 bg-white/90 backdrop-blur-sm border-b border-[#1A1A1A]/10 px-12 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-6">
            <span className="font-['Space_Mono'] text-xs uppercase tracking-widest flex items-center gap-2">
              <Loader2 className={`w-4 h-4 ${isGenerating ? "animate-spin text-[#726CEA]" : "text-[#1A1A1A]/50"}`} />
              {isGenerating ? "Aan het drukken..." : "Voltooid"}
            </span>
            <span className="font-['Space_Mono'] text-xs text-[#1A1A1A]/50">
              Tijd: {formatTime(elapsed)}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <button onClick={handleCopy} className="p-2 hover:bg-[#F4F4F0] rounded-sm transition-colors text-[#1A1A1A] group" title="Kopiëren">
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 group-hover:text-[#726CEA]" />}
            </button>
            <button className="p-2 hover:bg-[#F4F4F0] rounded-sm transition-colors text-[#1A1A1A] group" title="Downloaden">
              <Download className="w-4 h-4 group-hover:text-[#726CEA]" />
            </button>
          </div>
        </div>

        {/* Output Canvas */}
        <div className="px-12 py-16 max-w-3xl mx-auto">
          
          {/* Section 1: Reporting Specialist (Completed) */}
          <div className="mb-16 opacity-70 transition-opacity hover:opacity-100">
            <div className="flex items-center gap-4 mb-6 border-b border-[#1A1A1A]/10 pb-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <h3 className="font-['Space_Mono'] uppercase tracking-widest text-xs font-bold">Reporting Specialist</h3>
              <span className="text-xs text-[#1A1A1A]/50 italic ml-auto">Data opgehaald in 0:04</span>
            </div>
            
            <div className="font-['Space_Mono'] text-sm text-[#1A1A1A]/80 bg-[#F4F4F0] p-6 border border-[#1A1A1A]/10 leading-relaxed">
              <span className="block mb-2 text-[#1A1A1A] font-bold"># Ruwe Data Output</span>
              - Campagne: Search - Brand<br/>
              - Periode: 01/05/2024 - 31/05/2024<br/>
              - Vertoningen: 45.201 (+12% m/m)<br/>
              - Klikken: 3.402 (+8% m/m)<br/>
              - Conversies: 214 (+15% m/m)<br/>
              - CPA: €12,40 (-12% m/m)<br/>
              - Uitgave: €2.653,60
            </div>
          </div>

          {/* Section 2: Copywriter (Streaming) */}
          <div className="mb-16">
            <div className="flex items-center gap-4 mb-6 border-b border-[#1A1A1A] pb-2">
              <div className="w-2 h-2 rounded-full bg-[#726CEA] animate-pulse"></div>
              <h3 className="font-['Space_Mono'] uppercase tracking-widest text-xs font-bold text-[#726CEA]">Copywriter</h3>
              <span className="text-xs text-[#726CEA]/70 italic ml-auto">Aan het schrijven...</span>
            </div>

            <article className="prose prose-lg max-w-none">
              <p className="font-['Playfair_Display'] text-xl leading-relaxed mb-6">
                <span className="float-left text-6xl leading-[0.8] font-black mr-2 text-[#1A1A1A]">B</span>
                este Jeroen, <br/><br/>
                Hierbij ontvang je de maandelijkse update over de Google Ads-campagnes van Brouwerij De Vlaamse Leeuw voor de maand mei. We zien een sterke positieve trend die we graag toelichten.
              </p>

              <h4 className="font-['Playfair_Display'] font-bold text-2xl mt-8 mb-4 border-b border-[#1A1A1A]/10 pb-2">
                Kerncijfers op een rij
              </h4>

              <p className="font-['Inter'] leading-relaxed mb-4">
                De belangrijkste overwinning deze maand is de <strong>daling van de Cost Per Acquisition (CPA) met 12%</strong>. Dit betekent dat we efficiënter aankopen hebben gegenereerd via de 'Search - Brand' campagne. In totaal hebben we 214 conversies gerealiseerd tegen een CPA van €12,40.
              </p>

              <p className="font-['Inter'] leading-relaxed mb-4 relative">
                Daarnaast zien we een toename in het volume: 45.201 vertoningen resulteerden in 3.402 klikken. Dit bevestigt dat de aangescherpte advertentieteksten resoneren met de doelgroep.
                <span className="inline-block w-2 h-4 bg-[#726CEA] animate-pulse ml-1 align-middle"></span>
              </p>
            </article>
          </div>

          {/* Section 3: Client Success (Pending) */}
          <div className="mb-16 opacity-30">
            <div className="flex items-center gap-4 mb-6 border-b border-[#1A1A1A]/10 pb-2">
              <div className="w-2 h-2 rounded-full bg-[#1A1A1A]/30"></div>
              <h3 className="font-['Space_Mono'] uppercase tracking-widest text-xs font-bold">Client Success</h3>
              <span className="text-xs text-[#1A1A1A]/50 italic ml-auto">In wachtrij...</span>
            </div>
            
            <div className="h-24 border border-dashed border-[#1A1A1A]/20 flex items-center justify-center bg-[#F4F4F0]/50">
              <span className="font-['Space_Mono'] text-xs text-[#1A1A1A]/40 uppercase tracking-widest">Wachten op Copywriter...</span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
