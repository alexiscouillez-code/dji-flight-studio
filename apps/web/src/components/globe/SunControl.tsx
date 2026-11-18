"use client";
import { useEffect, useMemo, useState } from "react";
import { Sun, Sunrise, Sunset, Clock } from "lucide-react";
import { sunPosition, sunTimes, compassLabelFr } from "./sunLabels";

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (d: Date | null) => (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "—");
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Time-of-day control: real sun position for lighting, shadows and golden-hour planning. */
export function SunControl(props: { date: Date; fixed: Date | null; onChange(d: Date | null): void; lat: number; lon: number }) {
  // Times depend on the device clock and time zone: render only on the client (avoids hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <SunControlInner {...props} /> : <div className="h-24" />;
}

function SunControlInner({ date, fixed, onChange, lat, lon }: { date: Date; fixed: Date | null; onChange(d: Date | null): void; lat: number; lon: number }) {
  const times = useMemo(() => sunTimes(date, lat, lon), [date, lat, lon]);
  const pos = useMemo(() => sunPosition(date, lat, lon), [date, lat, lon]);
  const minutes = date.getHours() * 60 + date.getMinutes();
  const setMinutes = (m: number) => { const d = new Date(date); d.setHours(Math.floor(m / 60), m % 60, 0, 0); onChange(d); };
  const setDay = (v: string) => { const [y, mo, da] = v.split("-").map(Number); if (!y || !mo || !da) return; const d = new Date(date); d.setFullYear(y, mo - 1, da); onChange(d); };
  const go = (d: Date | null) => d && onChange(new Date(d));
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input type="date" className="input h-8 flex-1 text-xs" value={toDateInput(date)} onChange={(e) => setDay(e.target.value)} aria-label="Date" />
        <span className="mono w-12 text-right text-sm">{hm(date)}</span>
      </div>
      <input type="range" min={0} max={1439} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="w-full accent-[var(--color-warn)]" aria-label="Heure" />
      <div className="grid grid-cols-4 gap-1 text-[11px]">
        <button className={`btn h-7 justify-center px-1 ${!fixed ? "border-cyan/60" : ""}`} onClick={() => onChange(null)} title="Heure actuelle"><Clock size={11} />Live</button>
        <button className="btn h-7 justify-center px-1" onClick={() => go(times.sunrise)}><Sunrise size={11} />{hm(times.sunrise)}</button>
        <button className="btn h-7 justify-center px-1" onClick={() => go(times.goldenHourEvening)} title="Début de l'heure dorée"><Sun size={11} />{hm(times.goldenHourEvening)}</button>
        <button className="btn h-7 justify-center px-1" onClick={() => go(times.sunset)}><Sunset size={11} />{hm(times.sunset)}</button>
      </div>
      <p className="text-[10.5px] text-faint">
        Soleil {pos.altitudeDeg >= 0 ? `à ${pos.altitudeDeg.toFixed(0)}° au-dessus de l'horizon, plein ${compassLabelFr(pos.azimuthDeg)}` : "sous l'horizon"} · lever {hm(times.sunrise)} · heure dorée {hm(times.goldenHourEvening)} · coucher {hm(times.sunset)} · nuit civile {hm(times.dusk)} (heure de l'appareil, relief non pris en compte pour le lever/coucher).
      </p>
    </div>
  );
}
