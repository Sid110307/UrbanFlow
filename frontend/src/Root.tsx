import { useEffect, useState } from "react";
import App from "./App";
import { Landing } from "./pages/Landing";
import { SilkboardView } from "./pages/SilkboardView";

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

  if (isSilkboardPath(pathname)) return <SilkboardView />;
  if (isAppPath(pathname)) return <App />;
  return <Landing />;
}
