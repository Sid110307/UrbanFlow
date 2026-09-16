import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function NewWindowPortal({
  targetWindow,
  title,
  onClose,
  children,
}: {
  targetWindow: Window;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const containerRef = useRef(document.createElement("div"));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const win = targetWindow;
    win.document.title = title;
    win.document.body.style.margin = "0";
    win.document.body.style.background = "#f1f3f5";

    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const cssText = Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
        const styleEl = win.document.createElement("style");
        styleEl.textContent = cssText;
        win.document.head.appendChild(styleEl);
      } catch {
        if (sheet.href) {
          const link = win.document.createElement("link");
          link.rel = "stylesheet";
          link.href = sheet.href;
          win.document.head.appendChild(link);
        }
      }
    }

    win.document.body.appendChild(containerRef.current);
    setReady(true);

    const poll = setInterval(() => {
      if (win.closed) {
        clearInterval(poll);
        onClose();
      }
    }, 400);

    return () => {
      clearInterval(poll);
      if (!win.closed) win.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetWindow]);

  if (!ready) return null;
  return createPortal(children, containerRef.current);
}
