import { lazy, Suspense, useEffect, useState } from "react";

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

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <Suspense fallback={null}>
      {isSilkboardPath(pathname) ? <SilkboardView /> : isAppPath(pathname) ? <App /> : <Landing />}
    </Suspense>
  );
}
