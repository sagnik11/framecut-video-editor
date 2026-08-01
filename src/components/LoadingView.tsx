import { Brand } from "./Brand";

export function LoadingView({ label = "Loading workspace..." }: { label?: string }) {
  return (
    <main className="loading-view" aria-live="polite">
      <Brand />
      <div className="loading-bars" aria-hidden="true"><span /><span /><span /></div>
      <p>{label}</p>
    </main>
  );
}
