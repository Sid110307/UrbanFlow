import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type UIEvent,
} from "react";
import { navigateTo } from "../Root";

const SOURCE_URL = "https://data.opencity.in/dataset/bengaluru-stormwater-drains-maps";

interface NumericStat {
  label: string;
  target: number;
  decimals: number;
  suffix: string;
  detail: string;
}

interface TextStat {
  label: string;
  text: string;
  detail: string;
}

const NETWORK_STATS: Array<NumericStat | TextStat> = [
  { label: "Mapped network", target: 1988.4, decimals: 1, suffix: " km", detail: "Recorded drain length" },
  { label: "Drain segments", target: 6839, decimals: 0, suffix: "", detail: "Individually inspectable" },
  { label: "Hierarchy orders", target: 3, decimals: 0, suffix: "", detail: "Primary, secondary, tertiary" },
  { label: "Source", text: "OpenCity / BBMP", detail: "Updated Nov 2025" },
];

const FEATURES = [
  {
    tag: "01",
    title: "A real drain network",
    body: "6,839 mapped stormwater segments across primary, secondary, and tertiary hierarchy, sourced from BBMP through OpenCity's public dataset and rendered as a searchable, filterable map.",
  },
  {
    tag: "02",
    title: "A live scenario engine",
    body: "A Web Worker ticks the full network several times a second. Run the nominal monsoon baseline, a cloudburst storm cell, or inject a manual blockage and watch utilization propagate across the graph in real time.",
  },
  {
    tag: "03",
    title: "An on-device assistant",
    body: "Flow Assist reads the live simulation snapshot directly. Ask what needs attention, compare two drains, list the worst segments, or explain the selected one, and it answers from real state, not a script.",
  },
];

const STEPS = [
  {
    tag: "01",
    title: "Explore the network",
    body: "Search by ID or source reference, filter by drain order, and inspect any of the 6,839 real segments for its recorded length and GIS source record.",
  },
  {
    tag: "02",
    title: "Run a scenario",
    body: "Switch between the baseline, a cloudburst, or a manually injected blockage. Utilization, water level, flow, and the propagation log update on every tick.",
  },
  {
    tag: "03",
    title: "Ask Flow Assist",
    body: "Type a question or tap a starter. Answers are computed from the current snapshot in your browser, with no server round-trip and no API key.",
  },
];

const SCREENSHOTS = [
  {
    src: "/landing/drain-details.jpg",
    caption: "Per-segment telemetry, capacity trend, and estimated upstream and downstream relationships.",
  },
  {
    src: "/landing/flow-assist.jpg",
    caption: "Flow Assist answering a direct question from the live simulation snapshot.",
  },
];

function useReveal<T extends HTMLElement>(threshold = 0.18) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

function revealStyle(delayMs: number): CSSProperties {
  return { "--reveal-delay": `${delayMs}ms` } as CSSProperties;
}

function Reveal({
  as: Tag = "div",
  delay = 0,
  className = "",
  children,
}: {
  as?: "div" | "section" | "article" | "figure";
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <Tag
      ref={ref as never}
      className={`reveal${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
      style={revealStyle(delay)}
    >
      {children}
    </Tag>
  );
}

function CountUpStat({ stat }: { stat: NumericStat }) {
  const { ref, visible } = useReveal<HTMLDivElement>(0.4);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!visible) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setDisplay(stat.target.toLocaleString("en-IN", {
        minimumFractionDigits: stat.decimals,
        maximumFractionDigits: stat.decimals,
      }));
      return;
    }

    const duration = 1100;
    const start = performance.now();
    let frame: number;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = stat.target * eased;
      setDisplay(
        current.toLocaleString("en-IN", {
          minimumFractionDigits: stat.decimals,
          maximumFractionDigits: stat.decimals,
        }),
      );
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, stat.target, stat.decimals]);

  return (
    <div ref={ref} className={`landing-stat reveal${visible ? " is-visible" : ""}`}>
      <span>{stat.label}</span>
      <strong>
        {display}
        {stat.suffix}
      </strong>
      <small>{stat.detail}</small>
    </div>
  );
}

function TextStatBlock({ stat, delay }: { stat: TextStat; delay: number }) {
  return (
    <Reveal className="landing-stat" delay={delay}>
      <span>{stat.label}</span>
      <strong>{stat.text}</strong>
      <small>{stat.detail}</small>
    </Reveal>
  );
}

function HeroAccent() {
  return (
    <svg className="landing-hero-accent" viewBox="0 0 520 420" aria-hidden="true">
      <path
        className="accent-line accent-primary"
        d="M10 40 C 120 40, 130 120, 220 130 S 360 200, 360 260 S 300 380, 420 400"
        fill="none"
      />
      <path
        className="accent-line accent-secondary"
        d="M40 200 C 100 180, 160 230, 230 210 S 340 150, 430 170"
        fill="none"
      />
      <path
        className="accent-line accent-tertiary"
        d="M80 340 C 150 320, 190 360, 260 330 S 380 280, 470 300"
        fill="none"
      />
      <circle className="accent-dot" cx="420" cy="400" r="5" />
      <circle className="accent-dot" cx="430" cy="170" r="4" />
      <circle className="accent-dot" cx="470" cy="300" r="4" />
    </svg>
  );
}

function FeatureCard({ feature, delay }: { feature: (typeof FEATURES)[number]; delay: number }) {
  return (
    <Reveal as="article" className="landing-feature" delay={delay}>
      <span className="landing-feature-tag">{feature.tag}</span>
      <h3>{feature.title}</h3>
      <p>{feature.body}</p>
    </Reveal>
  );
}

function StepRow({ step, delay }: { step: (typeof STEPS)[number]; delay: number }) {
  return (
    <Reveal className="landing-step" delay={delay}>
      <span className="landing-feature-tag">{step.tag}</span>
      <div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
      </div>
    </Reveal>
  );
}

function GalleryShot({ shot, delay }: { shot: (typeof SCREENSHOTS)[number]; delay: number }) {
  return (
    <Reveal as="figure" delay={delay}>
      <img src={shot.src} alt={shot.caption} loading="lazy" />
      <figcaption>{shot.caption}</figcaption>
    </Reveal>
  );
}

export function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const scrollTicking = useRef(false);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    if (scrollTicking.current) return;
    scrollTicking.current = true;
    const target = event.currentTarget;
    requestAnimationFrame(() => {
      setScrolled(target.scrollTop > 8);
      scrollTicking.current = false;
    });
  }

  const heroShot = useReveal<HTMLDivElement>(0.1);

  return (
    <div className="landing" onScroll={handleScroll}>
      <header className={`landing-nav${scrolled ? " is-scrolled" : ""}`}>
        <div className="landing-brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span>UrbanFlow</span>
        </div>
        <div className="landing-nav-links">
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            Data source
          </a>
          <button type="button" className="landing-nav-cta" onClick={() => navigateTo("/app")}>
            Open the demo
          </button>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-glow" aria-hidden="true" />
        <HeroAccent />
        <p className="eyebrow reveal is-visible">Bengaluru stormwater, modeled live</p>
        <h1 className="reveal is-visible" style={revealStyle(80)}>
          See how the city&apos;s drains behave before the monsoon does.
        </h1>
        <p className="landing-hero-sub reveal is-visible" style={revealStyle(160)}>
          UrbanFlow renders Bengaluru's mapped stormwater network at full resolution, then layers a
          browser-side scenario engine on top: rainfall, capacity, and blockage propagation, computed
          live and clearly labeled as simulated. Nothing here needs a server, a database, or an API key.
        </p>
        <div className="landing-hero-actions reveal is-visible" style={revealStyle(240)}>
          <button type="button" className="landing-cta-primary" onClick={() => navigateTo("/app")}>
            Launch the live demo
          </button>
          <a className="landing-cta-secondary" href={SOURCE_URL} target="_blank" rel="noreferrer">
            View the OpenCity dataset
          </a>
        </div>

        <div className="landing-stats">
          {NETWORK_STATS.map((stat, index) =>
            "target" in stat ? (
              <CountUpStat key={stat.label} stat={stat} />
            ) : (
              <TextStatBlock key={stat.label} stat={stat} delay={index * 90} />
            ),
          )}
        </div>
      </section>

      <div
        ref={heroShot.ref}
        className={`landing-shot landing-shot-hero reveal-scale${heroShot.visible ? " is-visible" : ""}`}
      >
        <img src="/landing/network-overview.jpg" alt="UrbanFlow dashboard showing the full Bengaluru drain network" />
      </div>

      <section className="landing-section">
        <Reveal as="div">
          <p className="eyebrow">Why this exists</p>
          <h2>A GIS layer cannot tell you which segment is about to overflow.</h2>
        </Reveal>
        <div className="landing-twocol">
          <Reveal delay={60}>
            <p>
              Bengaluru's stormwater network is already mapped in public records: roughly 6,800 segments
              across three hierarchy orders. What that record cannot show is which segment is closest to
              capacity right now, or how a single obstruction two kilometers upstream shows up somewhere
              else twenty minutes later.
            </p>
          </Reveal>
          <Reveal delay={140}>
            <p>
              UrbanFlow keeps the real network intact and adds the missing layer: a deterministic capacity
              model per segment, a storm cell that ramps and moves, and a blockage that propagates pressure
              through the graph the same way an obstruction would. Every simulated number is labeled as
              such, next to the real geometry it sits on.
            </p>
          </Reveal>
        </div>
      </section>

      <Reveal as="section" className="landing-section landing-honest">
        <p className="eyebrow">What is real, what is modeled</p>
        <div className="landing-honest-grid">
          <div>
            <h3>Real</h3>
            <p>
              Drain geometry, hierarchy, recorded length, and source identifiers, published by BBMP
              through OpenCity's public dataset and updated November 2025.
            </p>
          </div>
          <div>
            <h3>Modeled for this demo</h3>
            <p>
              Rainfall, water level, flow, capacity utilization, and blockage propagation, computed
              deterministically in a browser Web Worker. Never presented as a flood forecast.
            </p>
          </div>
        </div>
      </Reveal>

      <section className="landing-section">
        <Reveal as="div">
          <p className="eyebrow">What it does</p>
          <h2>Three parts, all running in the tab you have open.</h2>
        </Reveal>
        <div className="landing-feature-grid">
          {FEATURES.map((feature, index) => (
            <FeatureCard key={feature.tag} feature={feature} delay={index * 90} />
          ))}
        </div>
      </section>

      <Reveal as="div" className="landing-shot reveal-scale">
        <img src="/landing/cloudburst-overlay.jpg" alt="Cloudburst scenario showing watch and critical risk overlays across the network" />
        <p>A cloudburst scenario mid-run, watch and critical thresholds spreading across the network.</p>
      </Reveal>

      <section className="landing-section landing-steps">
        <Reveal as="div">
          <p className="eyebrow">How it works</p>
          <h2>From a static map to a live control room in three steps.</h2>
        </Reveal>
        <div className="landing-step-list">
          {STEPS.map((step, index) => (
            <StepRow key={step.tag} step={step} delay={index * 90} />
          ))}
        </div>
      </section>

      <section className="landing-gallery">
        <Reveal as="div">
          <p className="eyebrow">A closer look</p>
        </Reveal>
        <div className="landing-gallery-grid">
          {SCREENSHOTS.map((shot, index) => (
            <GalleryShot key={shot.src} shot={shot} delay={index * 90} />
          ))}
        </div>
      </section>

      <Reveal as="section" className="landing-final">
        <p className="eyebrow">Ready when you are</p>
        <h2>Open the network and run a storm over Bengaluru.</h2>
        <button type="button" className="landing-cta-primary" onClick={() => navigateTo("/app")}>
          Launch the live demo
        </button>
      </Reveal>

      <footer className="landing-footer">
        <p>
          Drain geometry, hierarchy, and recorded length are published by BBMP through{" "}
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            OpenCity's Bengaluru stormwater drains dataset
          </a>
          , updated November 2025, and used under its public domain license. Rainfall, capacity, water
          level, flow, and incident data are deterministic demo telemetry, not a flood forecast.
        </p>
      </footer>
    </div>
  );
}
