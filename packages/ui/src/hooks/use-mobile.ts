import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

interface MediaQueryListLike {
  addEventListener: (type: "change", listener: () => void) => void;
  removeEventListener: (type: "change", listener: () => void) => void;
}

interface BrowserEnvironment {
  innerWidth: number;
  matchMedia: (query: string) => MediaQueryListLike;
}

function getBrowserEnvironment(): BrowserEnvironment | null {
  const environment = globalThis as Partial<BrowserEnvironment>;
  if (
    typeof environment.innerWidth === "number" &&
    typeof environment.matchMedia === "function"
  ) {
    return environment as BrowserEnvironment;
  }

  return null;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const environment = getBrowserEnvironment();
    if (!environment) {
      setIsMobile(false);
      return;
    }

    const mql = environment.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px)`
    );
    const onChange = () => {
      setIsMobile(environment.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
