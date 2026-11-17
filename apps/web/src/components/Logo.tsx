"use client";
import { useId } from "react";

export function Logo({ size = 28 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2ad4ee" />
          <stop offset="1" stopColor="#2e7bff" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#0b1018" stroke={`url(#${id})`} strokeOpacity=".6" />
      <path d="M6 22 C 11 10, 21 10, 26 22" fill="none" stroke={`url(#${id})`} strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="13" r="2.6" fill="#e9eef6" />
      <path d="M16 16.5 L16 24" stroke="#e9eef6" strokeOpacity=".35" strokeDasharray="1.5 2" />
    </svg>
  );
}
