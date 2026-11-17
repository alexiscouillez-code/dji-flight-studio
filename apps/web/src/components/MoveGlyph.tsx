/** Small schematic animation of a camera move (diagram, not a simulation). */
export type GlyphKind = "orbit" | "ascend" | "push" | "pull" | "track" | "reveal";

export function MoveGlyph({ kind }: { kind: GlyphKind }) {
  const subject = <circle cx="40" cy="40" r="4" fill="#e9eef6" />;
  const drone = <g><circle r="4.5" fill="#2ad4ee" /><circle r="9" fill="none" stroke="#2ad4ee" strokeOpacity=".35" /></g>;
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20" aria-hidden>
      <rect width="80" height="80" rx="12" fill="#06090f" />
      <path d="M0 62 L18 50 L30 56 L46 40 L60 50 L80 38 L80 80 L0 80Z" fill="#101724" />
      {kind === "orbit" && (<>
        <circle cx="40" cy="40" r="22" fill="none" stroke="#2e9bff" strokeOpacity=".35" strokeDasharray="2 3" />
        {subject}
        <g className="anim-orbit"><g transform="translate(62 40)">{drone}</g></g>
      </>)}
      {kind === "ascend" && (<>
        <path d="M40 66 L40 14" stroke="#2e9bff" strokeOpacity=".35" strokeDasharray="2 3" />
        <g className="anim-rise"><g transform="translate(40 40)">{drone}</g></g>
      </>)}
      {kind === "push" && (<>
        <path d="M12 40 L52 40" stroke="#2e9bff" strokeOpacity=".35" strokeDasharray="2 3" />
        <g transform="translate(60 0)">{subject}</g>
        <g className="anim-push"><g transform="translate(30 40)">{drone}</g></g>
      </>)}
      {kind === "pull" && (<>
        <path d="M40 40 L14 14" stroke="#2e9bff" strokeOpacity=".35" strokeDasharray="2 3" />
        {subject}
        <g className="anim-pull"><g transform="translate(34 34)">{drone}</g></g>
      </>)}
      {kind === "track" && (<>
        <path d="M12 26 L68 26" stroke="#2e9bff" strokeOpacity=".35" strokeDasharray="2 3" />
        <g className="anim-track"><g transform="translate(40 50)"><circle r="4" fill="#e9eef6" /></g><g transform="translate(40 26)">{drone}</g></g>
      </>)}
      {kind === "reveal" && (<>
        <path d="M14 66 Q 30 20 60 18" fill="none" stroke="#2e9bff" strokeOpacity=".35" strokeDasharray="2 3" />
        <g className="anim-rise"><g transform="translate(26 44)">{drone}</g></g>
      </>)}
    </svg>
  );
}
