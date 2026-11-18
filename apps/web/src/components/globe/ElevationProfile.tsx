"use client";
import { useMemo, useState } from "react";

export interface ProfileSeries { label: string; color: string; points: { distanceM: number; ele: number }[]; dashed?: boolean }

/** Elevation profile (SVG). Every series keeps its own source label: GPX and DEM are never merged. */
export function ElevationProfile({ series, height = 140 }: { series: ProfileSeries[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = height, P = { l: 38, r: 8, t: 8, b: 20 };
  const all = series.flatMap((s) => s.points);
  const dims = useMemo(() => {
    if (all.length < 2) return null;
    const maxD = Math.max(...all.map((p) => p.distanceM));
    let minE = Math.min(...all.map((p) => p.ele)), maxE = Math.max(...all.map((p) => p.ele));
    if (maxE - minE < 20) { minE -= 10; maxE += 10; }
    return { maxD, minE, maxE };
  }, [all]);
  if (!dims) return <div className="text-xs text-faint">Pas assez d'altitudes pour tracer un profil.</div>;
  const x = (d: number) => P.l + (d / dims.maxD) * (W - P.l - P.r);
  const y = (e: number) => P.t + (1 - (e - dims.minE) / (dims.maxE - dims.minE)) * (H - P.t - P.b);
  const path = (pts: ProfileSeries["points"]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.distanceM).toFixed(1)},${y(p.ele).toFixed(1)}`).join("");
  const main = series[0]!;
  const hoverPt = hover !== null ? nearest(main.points, hover) : null;
  const ticks = [dims.minE, (dims.minE + dims.maxE) / 2, dims.maxE];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" role="img" aria-label="Profil altimétrique"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(dims.maxD, ((px - P.l) / (W - P.l - P.r)) * dims.maxD)));
        }}
        onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="profile-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={main.color} stopOpacity=".28" /><stop offset="1" stopColor={main.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="rgb(148 163 184 / .12)" />
            <text x={P.l - 5} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#5b6678">{Math.round(t)}</text>
          </g>
        ))}
        <path d={`${path(main.points)}L${x(main.points.at(-1)!.distanceM)},${H - P.b}L${x(main.points[0]!.distanceM)},${H - P.b}Z`} fill="url(#profile-fill)" />
        {series.map((s) => <path key={s.label} d={path(s.points)} fill="none" stroke={s.color} strokeWidth="1.6" strokeDasharray={s.dashed ? "4 3" : undefined} />)}
        <text x={W - P.r} y={H - 5} textAnchor="end" fontSize="10" fill="#5b6678">{(dims.maxD / 1000).toFixed(1)} km</text>
        <text x={P.l} y={H - 5} fontSize="10" fill="#5b6678">0</text>
        {hoverPt && (
          <g>
            <line x1={x(hoverPt.distanceM)} x2={x(hoverPt.distanceM)} y1={P.t} y2={H - P.b} stroke="#e9eef6" strokeOpacity=".35" />
            <circle cx={x(hoverPt.distanceM)} cy={y(hoverPt.ele)} r="3.5" fill={main.color} />
          </g>
        )}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-faint">
        {series.map((s) => <span key={s.label} className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3" style={{ background: s.color }} />{s.label}</span>)}
        {hoverPt && <span className="mono ml-auto text-muted">{(hoverPt.distanceM / 1000).toFixed(2)} km · {Math.round(hoverPt.ele)} m</span>}
      </div>
    </div>
  );
}

function nearest(pts: ProfileSeries["points"], d: number) {
  let best = pts[0]!;
  for (const p of pts) if (Math.abs(p.distanceM - d) < Math.abs(best.distanceM - d)) best = p;
  return best;
}
