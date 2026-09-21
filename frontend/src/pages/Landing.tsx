import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type UIEvent,
} from "react";
import { navigateTo } from "../Root";
import { CityPolygonScene } from "../components/CityPolygonScene";

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
    body: "Run the nominal monsoon baseline, a cloudburst, or inject a manual blockage, and watch utilization propagate across the whole network in real time.",
  },
  {
    tag: "03",
    title: "An on-device assistant",
    body: "Flow Assist answers directly from what the network is doing right now: what needs attention, how two drains compare, which segments are worst, or why the one you picked is at risk.",
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
    body: "Switch between the baseline, a cloudburst, or a manually injected blockage. Utilization, water level, flow, and the propagation log update continuously.",
  },
  {
    tag: "03",
    title: "Ask Flow Assist",
    body: "Type a question or tap a starter and get an answer immediately, grounded in exactly what the network is doing right now.",
  },
];

const SCREENSHOTS = [
  {
    src: "/landing/drain-details.jpg",
    caption: "Per-segment telemetry, capacity trend, and upstream and downstream relationships.",
  },
  {
    src: "/landing/flow-assist.jpg",
    caption: "Flow Assist answering a direct question about the network.",
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
            Open the network
          </button>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-glow" aria-hidden="true" />
        <div className="landing-hero-split">
          <div className="landing-hero-copy">
            <p className="eyebrow reveal is-visible">Bengaluru's stormwater network</p>
            <h1 className="reveal is-visible" style={revealStyle(80)}>
              See how the city&apos;s drains behave before the monsoon does.
            </h1>
            <p className="landing-hero-sub reveal is-visible" style={revealStyle(160)}>
              UrbanFlow maps every drain in Bengaluru's stormwater network, then lets you run a cloudburst
              or a blockage and watch exactly which segments go critical, in what order, and why.
            </p>
            <div className="landing-hero-actions reveal is-visible" style={revealStyle(240)}>
              <button type="button" className="landing-cta-primary" onClick={() => navigateTo("/app")}>
                Open the network
              </button>
              <button type="button" className="landing-cta-silkboard" onClick={() => navigateTo("/app/silkboard")}>
                🛰 Silk Board deep-dive
              </button>
              <a className="landing-cta-secondary" href={SOURCE_URL} target="_blank" rel="noreferrer">
                View the OpenCity dataset
              </a>
            </div>
          </div>

          <div className="landing-hero-visual reveal is-visible" style={revealStyle(120)}>
            <CityPolygonScene />
          </div>
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
              UrbanFlow adds that missing layer: a capacity model for every segment, a storm cell that
              ramps and moves, and a blockage that propagates pressure through the network the way a
              real obstruction would, so you can see where the pressure is building before it overflows.
            </p>
          </Reveal>
        </div>
      </section>

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
          Open the network
        </button>
      </Reveal>

      <footer className="landing-footer">
        <p>
          Drain geometry, hierarchy, and recorded length come from BBMP's public dataset via{" "}
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            OpenCity
          </a>
          , updated November 2025. Rainfall, capacity, and water level come from UrbanFlow's own
          scenario engine.
        </p>
        <div className="landing-footer-meta">
          <span>&copy; 2026-Present Scuba Cats. All rights reserved.</span>
          <img
            className="landing-footer-egg"
            src="/landing/scuba-cat.gif"
            alt=""
            aria-hidden="true"
            loading="lazy"
          />
        </div>
      </footer>
    </div>
  );
}
