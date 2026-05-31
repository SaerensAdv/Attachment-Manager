import React, { useState, useEffect } from "react";
import { ChevronDown, Square, Copy, Download, Clock, Check, Play, Settings2, X, Plus } from "lucide-react";
import "./EveningEdition.css";

export function EveningEdition() {
  const [elapsed, setElapsed] = useState(42);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className="evening-wrapper evening-scrollbar overflow-y-auto">
      {/* Header */}
      <header className="sticky top-0 z-10 evening-glass evening-hairline flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 flex items-center justify-center border border-[var(--sa-border)]">
            <span className="evening-font-serif text-lg font-bold">SA</span>
          </div>
          <div className="h-4 w-px bg-[var(--sa-border)]"></div>
          <span className="evening-font-mono text-xs uppercase tracking-widest text-[var(--sa-gray)]">Avondeditie</span>
        </div>
        <div className="evening-font-mono text-xs text-[var(--sa-gray)]">
          Systeem actief • {formatTime(elapsed)}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-8 py-16 space-y-16">
        {/* Title */}
        <div className="space-y-4">
          <h1 className="evening-font-serif text-5xl tracking-tight">Commando</h1>
          <p className="evening-font-mono text-sm text-[var(--sa-gray)] uppercase tracking-wider">
            Sessie 804 • Geïnitieerd
          </p>
        </div>

        {/* Step 1: Client & Task */}
        <div className="space-y-8 relative">
          <div className="absolute -left-12 top-0 evening-font-mono text-xs text-[var(--sa-gray)] opacity-50">
            01
          </div>
          
          <div className="grid grid-cols-[160px_1fr] gap-8 items-start">
            <label className="evening-font-mono text-xs uppercase tracking-wider text-[var(--sa-gray)] pt-3">
              Klant
            </label>
            <div className="relative">
              <select className="evening-input w-full p-3 evening-font-serif text-xl appearance-none cursor-pointer">
                <option>Brouwerij De Vlaamse Leeuw</option>
                <option>Immo Peeters</option>
                <option>Kapsalon Maison</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--sa-gray)] pointer-events-none" />
            </div>
          </div>

          <div className="grid grid-cols-[160px_1fr] gap-8 items-start">
            <label className="evening-font-mono text-xs uppercase tracking-wider text-[var(--sa-gray)] pt-3">
              Opdracht
            </label>
            <textarea 
              className="evening-input w-full p-4 text-base leading-relaxed h-32 resize-none"
              defaultValue="Schrijf een maandelijkse update-mail over de Google Ads-resultaten van vorige maand."
            />
          </div>

          <div className="grid grid-cols-[160px_1fr] gap-8">
            <div />
            <button className="evening-btn evening-btn-primary evening-font-mono text-xs px-6 py-3 w-fit flex items-center gap-2 group">
              <Check className="w-4 h-4" />
              <span>Taak Herkend</span>
            </button>
          </div>
        </div>

        {/* Step 2: Recognition & Team */}
        <div className="space-y-8 relative evening-hairline-t pt-16">
          <div className="absolute -left-12 top-16 evening-font-mono text-xs text-[var(--sa-gray)] opacity-50">
            02
          </div>

          <div className="grid grid-cols-[160px_1fr] gap-8">
            <label className="evening-font-mono text-xs uppercase tracking-wider text-[var(--sa-gray)] pt-1">
              Analyse
            </label>
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="bg-[var(--sa-accent)] text-white evening-font-mono text-[10px] px-2 py-1 uppercase tracking-widest">
                  E-mail
                </span>
                <span className="text-sm text-[var(--sa-paper)] opacity-80">
                  Maandelijkse update voor klant over campagneresultaten.
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[160px_1fr] gap-8">
            <label className="evening-font-mono text-xs uppercase tracking-wider text-[var(--sa-gray)] pt-3">
              Systeem
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-[var(--sa-border)] p-4 relative group cursor-pointer hover:border-[var(--sa-gray)] transition-colors">
                <div className="evening-font-mono text-[10px] text-[var(--sa-gray)] uppercase tracking-wider mb-2">Workflow</div>
                <div className="text-sm font-medium">Klant Update Mail</div>
                <Settings2 className="w-4 h-4 text-[var(--sa-gray)] absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="border border-[var(--sa-border)] p-4 relative group cursor-pointer hover:border-[var(--sa-gray)] transition-colors">
                <div className="evening-font-mono text-[10px] text-[var(--sa-gray)] uppercase tracking-wider mb-2">Leidinggevende Agent</div>
                <div className="text-sm font-medium">Reporting Specialist</div>
                <Settings2 className="w-4 h-4 text-[var(--sa-gray)] absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[160px_1fr] gap-8">
            <label className="evening-font-mono text-xs uppercase tracking-wider text-[var(--sa-gray)] pt-3">
              Teamlijst
            </label>
            <div className="border border-[var(--sa-border)]">
              <div className="flex items-center justify-between p-4 evening-hairline">
                <div className="flex items-center gap-3">
                  <span className="evening-font-mono text-xs text-[var(--sa-gray)]">01</span>
                  <span className="text-sm">Reporting Specialist</span>
                </div>
                <span className="evening-font-mono text-[10px] text-[var(--sa-accent)] uppercase tracking-widest">Lead</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-[rgba(255,255,255,0.02)]">
                <div className="flex items-center gap-3">
                  <span className="evening-font-mono text-xs text-[var(--sa-gray)]">02</span>
                  <span className="text-sm">Copywriter</span>
                </div>
                <button className="text-[var(--sa-gray)] hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Smart Intake */}
        <div className="space-y-8 relative evening-hairline-t pt-16">
          <div className="absolute -left-12 top-16 evening-font-mono text-xs text-[var(--sa-gray)] opacity-50">
            03
          </div>

          <div className="grid grid-cols-[160px_1fr] gap-8">
            <label className="evening-font-mono text-xs uppercase tracking-wider text-[var(--sa-gray)] pt-3">
              Vereisten
            </label>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm">Periode</label>
                <input type="text" className="evening-input w-full p-3 text-sm" defaultValue="Oktober 2023" />
              </div>
              <div className="space-y-2">
                <label className="text-sm">Belangrijkste cijfers</label>
                <input type="text" className="evening-input w-full p-3 text-sm" defaultValue="+15% conversies, CPA gedaald met €2" />
              </div>
              <div className="space-y-2">
                <label className="text-sm">Toon</label>
                <select className="evening-input w-full p-3 text-sm appearance-none">
                  <option>Professioneel & enthousiast</option>
                  <option>Formeel</option>
                  <option>Informeel</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[160px_1fr] gap-8 mt-8">
            <div />
            <button className="evening-btn evening-btn-primary evening-font-mono text-xs px-8 py-4 w-full flex justify-center items-center gap-3">
              <Play className="w-4 h-4 fill-current" />
              <span>Genereren (Bezig)</span>
            </button>
          </div>
        </div>

        {/* Step 4: Streaming Output */}
        <div className="space-y-8 relative evening-hairline-t pt-16 pb-32">
          <div className="absolute -left-12 top-16 evening-font-mono text-xs text-[var(--sa-accent)]">
            04
          </div>

          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="evening-font-serif text-3xl mb-2">Live Dossier</h2>
              <div className="evening-font-mono text-xs text-[var(--sa-gray)] uppercase tracking-wider">
                Stap 1 van 2
              </div>
            </div>
            <button className="evening-btn border-red-900/50 text-red-500 hover:bg-red-900/20 hover:text-red-400 evening-font-mono text-xs px-4 py-2 flex items-center gap-2">
              <Square className="w-3 h-3 fill-current" />
              <span>Stop</span>
            </button>
          </div>

          <div className="grid grid-cols-[160px_1fr] gap-8">
            <div className="pt-2">
              <div className="flex items-center gap-2 text-[var(--sa-accent)] evening-font-mono text-xs uppercase tracking-wider mb-2">
                <div className="w-2 h-2 rounded-full bg-[var(--sa-accent)] animate-pulse" />
                Bezig
              </div>
              <div className="text-sm font-medium">Reporting Specialist</div>
            </div>
            
            <div className="border border-[var(--sa-border)] bg-[rgba(0,0,0,0.2)] p-6 relative">
              <div className="prose prose-invert prose-sm max-w-none">
                <p className="text-[var(--sa-gray)] evening-font-mono text-xs uppercase tracking-wider mb-4">
                  # Gegevens verzamelen en structureren
                </p>
                <p>
                  Uit de analyse van de data voor <strong>Brouwerij De Vlaamse Leeuw</strong> over de maand <strong>Oktober 2023</strong> blijkt een positieve trend.
                </p>
                <ul>
                  <li>Conversies zijn met 15% gestegen ten opzichte van september.</li>
                  <li>De Cost Per Acquisition (CPA) is succesvol gedaald met €2,00.</li>
                </ul>
                <p>
                  We zien dat de recente aanpassingen in de biedstrategieën hun vruchten afwerpen, vooral in de 'Speciaalbieren' campagne...<span className="evening-cursor"></span>
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[160px_1fr] gap-8 mt-8 opacity-40">
            <div className="pt-2">
              <div className="flex items-center gap-2 text-[var(--sa-gray)] evening-font-mono text-xs uppercase tracking-wider mb-2">
                <Clock className="w-3 h-3" />
                Wachtrij
              </div>
              <div className="text-sm font-medium">Copywriter</div>
            </div>
            
            <div className="border border-[var(--sa-border)] border-dashed p-6 flex items-center justify-center min-h-[120px]">
              <span className="evening-font-mono text-xs text-[var(--sa-gray)]">Wachten op output van Reporting Specialist...</span>
            </div>
          </div>
          
        </div>

      </main>
      
      {/* Fixed bottom bar for actions when complete (hidden in this state, but structure is there) */}
      <div className="fixed bottom-0 left-0 right-0 evening-glass evening-hairline-t p-4 translate-y-full">
        <div className="max-w-3xl mx-auto flex justify-end gap-4">
          <button className="evening-btn evening-font-mono text-xs px-4 py-2 flex items-center gap-2">
            <Copy className="w-4 h-4" />
            <span>Kopieer alles</span>
          </button>
          <button className="evening-btn evening-font-mono text-xs px-4 py-2 flex items-center gap-2">
            <Download className="w-4 h-4" />
            <span>Download MD</span>
          </button>
        </div>
      </div>
    </div>
  );
}
