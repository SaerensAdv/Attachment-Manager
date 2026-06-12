import { useMemo, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Html } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { Search, Send, ChevronRight, Briefcase } from "lucide-react";
import { NODES, EDGES, CAT_META, degreeOf, LAYER_ORDER } from "./_data";
import type { Cat } from "./_data";
import "./Aurora.css";

const TABS = ["Kaart", "Dashboard", "Team", "Klanten", "Crawl", "Archief", "Planning", "Controle"];
const SERVICE_LINES = ["Overzicht", "Paid Media", "SEO & Web", "Content & Creative", "Client Growth"];

const R = 1.62; // sphere radius

/* ---------- helpers ---------- */

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

function toColor(s: string): THREE.Color {
  const m = s.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/);
  if (m) return new THREE.Color().setHSL(+m[1] / 360, +m[2] / 100, +m[3] / 100);
  return new THREE.Color(s);
}

function fibSphere(n: number, radius: number, jitter = 0): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / Math.max(n - 1, 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = phi * i;
    const rad = radius * (1 + (Math.random() - 0.5) * jitter);
    pts.push([Math.cos(theta) * r * rad, y * rad, Math.sin(theta) * r * rad]);
  }
  return pts;
}

function makeGlowTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(0.55, "rgba(255,255,255,0.28)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

const PARTICLE_PALETTE = ["#38bdf8", "#22d3ee", "#60a5fa", "#3b82f6", "#0ea5e9"];
const ACCENT_PALETTE = ["#f59e0b", "#fbbf24", "#fb923c"];

interface RealNodeData {
  id: string;
  label: string;
  cat: Cat;
  pos: THREE.Vector3;
  color: THREE.Color;
  deg: number;
  isOrch: boolean;
  always: boolean;
}

/* ---------- single agency node (glow + hover label) ---------- */

function RealNode({ node, tex }: { node: RealNodeData; tex: THREE.Texture }) {
  const [hover, setHover] = useState(false);
  const r = node.isOrch ? 0.055 : 0.026 + Math.min(node.deg, 9) * 0.0022;
  const glow = node.isOrch ? 0.95 : 0.46;
  const show = node.always || hover;

  return (
    <group position={node.pos}>
      <sprite scale={[glow, glow, glow]}>
        <spriteMaterial
          map={tex}
          color={node.color}
          blending={THREE.AdditiveBlending}
          transparent
          depthWrite={false}
          toneMapped={false}
          opacity={0.9}
        />
      </sprite>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
      >
        <sphereGeometry args={[r, 18, 18]} />
        <meshBasicMaterial color={node.color} toneMapped={false} />
      </mesh>
      {show && (
        <Html center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className={`aurora-node-label ${node.isOrch ? "is-hub" : ""}`}>{node.label}</div>
        </Html>
      )}
    </group>
  );
}

/* ---------- the network sphere ---------- */

function SphereField() {
  const built = useMemo(() => {
    const tex = makeGlowTexture();

    /* agency nodes mapped onto the shell */
    const nodePos = fibSphere(NODES.length, R, 0.04);
    const bestByCat: Record<string, { id: string; deg: number }> = {};
    NODES.forEach((n) => {
      const d = degreeOf(n.id);
      if (!bestByCat[n.cat] || d > bestByCat[n.cat].deg) bestByCat[n.cat] = { id: n.id, deg: d };
    });
    const always = new Set<string>(Object.values(bestByCat).map((b) => b.id));
    always.add("a-orch");

    const realNodes: RealNodeData[] = NODES.map((n, i) => {
      const [x, y, z] = nodePos[i];
      return {
        id: n.id,
        label: n.label,
        cat: n.cat,
        pos: new THREE.Vector3(x, y, z),
        color: toColor(CAT_META[n.cat].color),
        deg: degreeOf(n.id),
        isOrch: n.id === "a-orch",
        always: always.has(n.id),
      };
    });
    const posById: Record<string, THREE.Vector3> = {};
    realNodes.forEach((rn) => (posById[rn.id] = rn.pos));

    /* ambient particle cloud */
    const N = 680;
    const cloud = fibSphere(N, R, 0.07);
    const px: number[] = [], py: number[] = [], pz: number[] = [];
    const pColors = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const [x, y, z] = cloud[i];
      px.push(x); py.push(y); pz.push(z);
      const isAccent = Math.random() < 0.13;
      const hex = isAccent
        ? ACCENT_PALETTE[(Math.random() * ACCENT_PALETTE.length) | 0]
        : PARTICLE_PALETTE[(Math.random() * PARTICLE_PALETTE.length) | 0];
      const col = new THREE.Color(hex).multiplyScalar(0.6 + Math.random() * 0.7);
      pColors[i * 3] = col.r;
      pColors[i * 3 + 1] = col.g;
      pColors[i * 3 + 2] = col.b;
    }
    const pointsGeom = new THREE.BufferGeometry();
    pointsGeom.setAttribute("position", new THREE.Float32BufferAttribute(interleave(px, py, pz), 3));
    pointsGeom.setAttribute("color", new THREE.BufferAttribute(pColors, 3));
    const points = new THREE.Points(
      pointsGeom,
      new THREE.PointsMaterial({
        size: 0.055,
        map: tex,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        toneMapped: false,
        alphaTest: 0.01,
      }),
    );

    /* woven web between nearby particles */
    const lpos: number[] = [];
    const lcol: number[] = [];
    const linkCount = new Array(N).fill(0);
    const maxLinks = 3;
    const thr = R * 0.3;
    const web = new THREE.Color("#2dd4ef");
    for (let i = 0; i < N; i++) {
      if (linkCount[i] >= maxLinks) continue;
      for (let j = i + 1; j < N; j++) {
        if (linkCount[i] >= maxLinks) break;
        if (linkCount[j] >= maxLinks) continue;
        const dx = px[i] - px[j], dy = py[i] - py[j], dz = pz[i] - pz[j];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < thr) {
          lpos.push(px[i], py[i], pz[i], px[j], py[j], pz[j]);
          const f = 0.55;
          lcol.push(web.r * f, web.g * f, web.b * f, web.r * f, web.g * f, web.b * f);
          linkCount[i]++; linkCount[j]++;
        }
      }
    }
    const ambientGeom = new THREE.BufferGeometry();
    ambientGeom.setAttribute("position", new THREE.Float32BufferAttribute(lpos, 3));
    ambientGeom.setAttribute("color", new THREE.Float32BufferAttribute(lcol, 3));
    const ambientLines = new THREE.LineSegments(
      ambientGeom,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );

    /* the REAL agency edges as bright arcs over the shell */
    const rpos: number[] = [];
    const rcol: number[] = [];
    EDGES.forEach((e) => {
      const a = posById[e.source];
      const b = posById[e.target];
      if (!a || !b) return;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      if (mid.length() < 1e-4) mid.copy(a);
      mid.normalize().multiplyScalar(R * 1.16);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const pts = curve.getPoints(22);
      let c: THREE.Color;
      let bright: number;
      if (e.kind === "routing") { c = new THREE.Color("#818cf8"); bright = 0.95; }
      else if (e.kind === "flow") { c = new THREE.Color("#22d3ee"); bright = 1.05; }
      else if (e.kind === "reference") { c = new THREE.Color("#38bdf8"); bright = 0.5; }
      else { c = new THREE.Color("#64748b"); bright = 0.3; }
      for (let k = 0; k < pts.length - 1; k++) {
        rpos.push(pts[k].x, pts[k].y, pts[k].z, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z);
        rcol.push(c.r * bright, c.g * bright, c.b * bright, c.r * bright, c.g * bright, c.b * bright);
      }
    });
    const reGeom = new THREE.BufferGeometry();
    reGeom.setAttribute("position", new THREE.Float32BufferAttribute(rpos, 3));
    reGeom.setAttribute("color", new THREE.Float32BufferAttribute(rcol, 3));
    const realEdges = new THREE.LineSegments(
      reGeom,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );

    return { tex, points, ambientLines, realEdges, realNodes };
  }, []);

  return (
    <group>
      <primitive object={built.ambientLines} />
      <primitive object={built.realEdges} />
      <primitive object={built.points} />
      {built.realNodes.map((rn) => (
        <RealNode key={rn.id} node={rn} tex={built.tex} />
      ))}
    </group>
  );
}

function Scene({ reduced }: { reduced: boolean }) {
  return (
    <>
      <color attach="background" args={["#03050a"]} />
      <fog attach="fog" args={["#050b1a", 2.8, 7.6]} />
      <PerspectiveCamera makeDefault position={[0, 0, 4.5]} fov={46} />
      <SphereField />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.4}
        autoRotate={!reduced}
        autoRotateSpeed={0.7}
      />
      <EffectComposer>
        <Bloom intensity={1.15} luminanceThreshold={0.12} luminanceSmoothing={0.9} mipmapBlur radius={0.72} />
      </EffectComposer>
    </>
  );
}

/* ---------- page chrome ---------- */

export function Aurora() {
  const reduced = usePrefersReducedMotion();

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    NODES.forEach((n) => (counts[n.cat] = (counts[n.cat] || 0) + 1));
    return counts;
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-slate-200 font-['Inter'] flex flex-col bg-[#03050a] aurora-bg">
      <div className="absolute inset-0 aurora-noise z-0" />

      {/* Top bar */}
      <header className="relative z-20 flex items-center px-6 py-4 glass-panel border-x-0 border-t-0 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-8">
          <div className="flex flex-col">
            <span className="font-['Playfair_Display'] text-xl font-medium tracking-wide text-white glow-text">Saerens AI</span>
            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.2em] text-cyan-400/70">Operations Atlas</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 ml-8">
            {TABS.map((tab, i) => (
              <button
                key={tab}
                className={`text-sm tracking-wide transition-colors ${
                  i === 0
                    ? "text-cyan-400 font-medium drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="flex-1 flex relative z-10 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 flex-shrink-0 glass-panel border-y-0 border-l-0 border-r border-white/5 flex flex-col p-6 overflow-y-auto">
          <div className="relative mb-8">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Documenten doorzoeken..."
              className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50 focus:bg-white/10 transition-all font-['Space_Mono']"
            />
          </div>

          <div className="mb-8">
            <h3 className="text-[11px] uppercase tracking-[0.15em] font-['Space_Mono'] text-slate-500 mb-4">Categorieën</h3>
            <ul className="space-y-3">
              {LAYER_ORDER.map((cat) => {
                const meta = CAT_META[cat];
                const count = categoryCounts[cat] || 0;
                return (
                  <li key={cat} className="flex items-center justify-between group cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-2 h-2 rounded-full transition-all group-hover:scale-125"
                        style={{ backgroundColor: meta.color, boxShadow: `0 0 8px ${meta.color}` }}
                      />
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{meta.labelNl}</span>
                    </div>
                    <span className="text-xs font-['Space_Mono'] text-slate-600 group-hover:text-cyan-400/80 transition-colors">
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mb-auto">
            <h3 className="text-[11px] uppercase tracking-[0.15em] font-['Space_Mono'] text-slate-500 mb-4">Service-lijn</h3>
            <ul className="space-y-1">
              {SERVICE_LINES.map((line, i) => (
                <li key={line}>
                  <button
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                      i === 0
                        ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                    }`}
                  >
                    {line}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 pt-6 border-t border-white/5 flex items-center bg-white/5 rounded-full p-1 relative overflow-hidden">
            <div className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-cyan-500/20 border border-cyan-500/30 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.2)]" />
            <button className="flex-1 relative z-10 text-xs font-medium py-1.5 text-cyan-300 text-center">Organisch</button>
            <button className="flex-1 relative z-10 text-xs font-medium py-1.5 text-slate-400 text-center">Gelaagd</button>
          </div>
        </aside>

        {/* Map / 3D field */}
        <main className="flex-1 relative overflow-hidden">
          <Canvas dpr={[1, 2]} gl={{ antialias: true }} className="absolute inset-0">
            <Scene reduced={reduced} />
          </Canvas>

          {/* readability vignette */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_55%,rgba(3,5,10,0.55)_100%)]" />

          <div className="pointer-events-none absolute top-6 right-7 text-right">
            <p className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.25em] text-cyan-400/60">Levend netwerk</p>
            <p className="font-['Space_Mono'] text-[10px] uppercase tracking-[0.2em] text-slate-600 mt-1">
              {NODES.length} knooppunten · {EDGES.length} verbindingen
            </p>
          </div>
        </main>
      </div>

      {/* Command bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[800px] max-w-[90vw] z-30">
        <div className="glass-panel rounded-full p-2 flex items-center gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.8)] border-white/10">
          <button className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/5 whitespace-nowrap">
            <Briefcase className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium text-slate-200">Kies klant</span>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
          <input
            type="text"
            placeholder="Beschrijf de opdracht en druk op Enter..."
            className="flex-1 bg-transparent border-none text-white placeholder:text-slate-500 focus:outline-none px-2 text-sm"
          />
          <button className="w-10 h-10 rounded-full bg-cyan-500 hover:bg-cyan-400 flex items-center justify-center transition-colors shadow-[0_0_15px_rgba(34,211,238,0.5)] flex-shrink-0">
            <Send className="w-4 h-4 text-[#03050a] ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* interleave three parallel coord arrays into [x0,y0,z0, x1,y1,z1, ...] */
function interleave(px: number[], py: number[], pz: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < px.length; i++) out.push(px[i], py[i], pz[i]);
  return out;
}
