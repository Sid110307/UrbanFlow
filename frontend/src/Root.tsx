import { lazy, Suspense, useEffect, useState } from "react";
import { isAuthenticated } from "./kindeAuth";
import { LoginGate } from "./LoginGate";

const App = lazy(() => import("./App"));
const Landing = lazy(() => import("./Landing").then((m) => ({ default: m.Landing })));
const SilkboardView = lazy(() => import("./SilkboardView").then((m) => ({ default: m.SilkboardView })));

function isAppPath(pathname: string) {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function isSilkboardPath(pathname: string) {
  return pathname === "/app/silkboard" || pathname.startsWith("/app/silkboard/");
}

export function navigateTo(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function Root() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    isAuthenticated()
      .then(setAuthed)
      .catch(() => setAuthed(false));
  }, []);

  if (isAppPath(pathname)) {
    if (authed === null) return null;
    if (!authed) return <LoginGate />;
  }

  return (
    <Suspense fallback={null}>
      {isSilkboardPath(pathname) ? <SilkboardView /> : isAppPath(pathname) ? <App /> : <Landing />}
    </Suspense>
  );
}
