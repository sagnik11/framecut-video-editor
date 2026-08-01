type AutterMarkProps = {
  compact?: boolean;
  label?: string;
};

export function AutterMark({ compact = false, label = "Sponsored by" }: AutterMarkProps) {
  return (
    <a
      className={`autter-mark ${compact ? "is-compact" : ""}`}
      href="https://www.autter.dev/"
      target="_blank"
      rel="noreferrer"
      aria-label="Visit Autter, sponsor of Framecut"
    >
      {!compact && <span>{label}</span>}
      <span className="autter-wordmark-wrap" aria-hidden="true">
        <img className="autter-wordmark autter-wordmark-for-light" src="/autter-wordmark-light.png" width="1704" height="671" alt="" />
        <img className="autter-wordmark autter-wordmark-for-dark" src="/autter-wordmark-dark.png" width="1591" height="347" alt="" />
      </span>
    </a>
  );
}
