import { useEffect, useState } from "react";
import App from "./App";
import { Landing } from "./pages/Landing";

function isAppPath(pathname: string) {
  return pathname === "/app" || pathname.startsWith("/app/");
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

  return isAppPath(pathname) ? <App /> : <Landing />;
}
