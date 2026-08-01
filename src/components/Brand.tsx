import { FilmStripIcon } from "@phosphor-icons/react";
import { AutterMark } from "./AutterMark";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-lockup" aria-label="Framecut, sponsored by Autter">
      <span className="brand-mark"><FilmStripIcon weight="fill" /></span>
      <span className="brand-name">Framecut</span>
      {!compact && <AutterMark />}
    </div>
  );
}
