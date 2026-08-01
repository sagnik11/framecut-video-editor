import { useEffect } from "react";
import { AuthPage } from "./components/AuthPage";
import { Dashboard } from "./components/Dashboard";
import { Editor } from "./components/Editor";
import { LandingPage } from "./components/LandingPage";
import { LoadingView } from "./components/LoadingView";
import { authClient } from "./lib/auth-client";
import { navigate, usePathname } from "./lib/navigation";

export default function App() {
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (session && (pathname === "/sign-in" || pathname === "/sign-up")) navigate("/projects");
  }, [pathname, session]);

  if (isPending) return <LoadingView />;

  if (pathname === "/") return <LandingPage signedIn={Boolean(session)} />;
  if (pathname === "/sign-up") return session ? <LoadingView /> : <AuthPage mode="sign-up" />;
  if (pathname === "/sign-in") return session ? <LoadingView /> : <AuthPage mode="sign-in" />;

  if (!session) return <AuthPage mode="sign-in" />;
  if (pathname === "/projects") return <Dashboard userName={session.user.name} />;

  const editorMatch = pathname.match(/^\/editor\/([^/]+)$/);
  if (editorMatch) return <Editor projectId={decodeURIComponent(editorMatch[1])} />;

  return <LandingPage signedIn />;
}
