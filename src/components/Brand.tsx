import { FilmStripIcon } from "@phosphor-icons/react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-lockup" aria-label="Framecut, sponsored by Autter">
      <span className="brand-mark"><FilmStripIcon weight="fill" /></span>
      <span className="brand-name">Framecut</span>
      {!compact && <span className="sponsor-line">Sponsored by <strong>AUTTER</strong></span>}
    </div>
  );
}
