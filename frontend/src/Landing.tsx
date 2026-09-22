import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type UIEvent,
} from "react";
import { navigateTo } from "./Root";
import { CityPolygonScene } from "./components/CityPolygonScene";

const SOURCE_URL = "https://data.opencity.in/dataset/bengaluru-stormwater-drains-maps";
const GITHUB_URL = "https://github.com/Sid110307/UrbanFlow";

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
    title: "An AI assistant",
    body: "Flow Assist is an AI assistant that answers directly from what the network is doing right now: what needs attention, how two drains compare, which segments are worst, or why the one you picked is at risk.",
  },
];

const STEPS = [
  {
    tag: "01",
    title: "Explore the network",
    body: "Search by ID or source reference, filter by drain order, and inspect any of the 6,839 real segments for its recorded length and GIS source record.",
    image: "/landing/network-overview.jpg",
  },
  {
    tag: "02",
    title: "Run a scenario",
    body: "Switch between the baseline, a cloudburst, or a manually injected blockage. Utilization, water level, flow, and the propagation log update continuously.",
    image: "/landing/cloudburst-overlay.jpg",
  },
  {
    tag: "03",
    title: "Ask Flow Assist",
    body: "Type a question or tap a starter and get an answer from Flow Assist's AI, grounded in exactly what the network is doing right now.",
    image: "/landing/flow-assist.jpg",
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
  {
    src: "/landing/silkboard-overview.jpg",
    caption: "Silk Board Junction: live drain, camera, and flood-sensor telemetry over the real interchange.",
  },
  {
    src: "/landing/silkboard-assist.jpg",
    caption: "UrbanFlow Assist reasoning over Silk Board's evidence-gated self-healing pipeline.",
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

function useParallax<T extends HTMLElement>(strength = 10) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    const scrollParent = node?.closest(".landing");
    if (!node || !scrollParent) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;

    function update() {
      const rect = node!.getBoundingClientRect();
      const viewportH = window.innerHeight || 1;
      const centerOffset = (rect.top + rect.height / 2 - viewportH / 2) / viewportH;
      const clamped = Math.max(-1, Math.min(1, centerOffset));
      node!.style.setProperty("--parallax", `${(-clamped * strength).toFixed(2)}px`);
      frame = 0;
    }

    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(update);
    }

    scrollParent.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      scrollParent.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [strength]);

  return ref;
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
      // cubic ease-out check https://easings.net/#easeOutCubic legit feels diff
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

function StepRow({
  step,
  index,
  delay,
  isActive,
  onActivate,
}: {
  step: (typeof STEPS)[number];
  index: number;
  delay: number;
  isActive: boolean;
  onActivate: (index: number) => void;
}) {
  const { ref, visible } = useReveal<HTMLDivElement>();

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onActivate(index);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <div
      ref={ref}
      className={`landing-step reveal${visible ? " is-visible" : ""}${isActive ? " is-active" : ""}`}
      style={revealStyle(delay)}
    >
      <span className="landing-feature-tag">{step.tag}</span>
      <div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
      </div>
    </div>
  );
}

function StepsVisual({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="landing-steps-sticky">
      <div className="landing-steps-visual">
        {STEPS.map((step, index) => (
          <img
            key={step.tag}
            src={step.image}
            alt=""
            className={`landing-steps-visual-img${activeIndex === index ? " is-active" : ""}`}
            loading="lazy"
          />
        ))}
      </div>
    </div>
  );
}

function ScrollScrubVideo() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const frameElRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const durationRef = useRef(0);
  const frameRef = useRef(0);
  // Chromium can throw a decode-pipeline error if currentTime is reassigned
  // before the previous seek finishes, which happens easily during a fast
  // scroll. Queue at most one pending target and apply it once "seeked" fires.
  const seekingRef = useRef(false);
  const pendingRef = useRef<number | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const video = videoRef.current;
    const scrollParent = wrapper?.closest(".landing");
    if (!wrapper || !video || !scrollParent) return;

    function seekTo(target: number) {
      if (seekingRef.current) {
        pendingRef.current = target;
        return;
      }
      if (Math.abs(video!.currentTime - target) < 0.08) return;
      seekingRef.current = true;
      video!.currentTime = target;
    }

    function onLoaded() {
      durationRef.current = video!.duration || 0;
    }

    function onSeeked() {
      seekingRef.current = false;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending !== null) seekTo(pending);
    }

    function onError() {
      seekingRef.current = false;
    }

    function update() {
      const rect = wrapper!.getBoundingClientRect();
      const viewportH = window.innerHeight || 1;
      const total = rect.height - viewportH;
      const progress = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      if (durationRef.current > 0) seekTo(progress * durationRef.current);

      // Ease the pinned frame in and out of the first/last slice of the
      // scroll range instead of hard-cutting to and from full size, so it
      // reads as one continuous motion rather than a separate component.
      const EASE = 0.12;
      let t = 1;
      if (progress < EASE) t = progress / EASE;
      else if (progress > 1 - EASE) t = (1 - progress) / EASE;
      const eased = t * t * (3 - 2 * t);
      const frame = frameElRef.current;
      if (frame) {
        frame.style.transform = `scale(${(0.92 + 0.08 * eased).toFixed(4)})`;
        frame.style.opacity = (0.25 + 0.75 * eased).toFixed(3);
      }

      frameRef.current = 0;
    }

    function onScroll() {
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(update);
    }

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    scrollParent.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      scrollParent.removeEventListener("scroll", onScroll);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div ref={wrapperRef} className="landing-scrub">
      <div className="landing-scrub-sticky">
        <div ref={frameElRef} className="landing-scrub-frame">
          <video
            ref={videoRef}
            poster="/landing/flood-hero-poster.jpg"
            muted
            playsInline
            preload="auto"
            aria-label="Animated isometric illustration of a Bengaluru street intersection flooding and receding, scrubbed by scroll position"
          >
            <source src="/landing/flood-hero.mp4" type="video/mp4" />
            <source src="/landing/flood-hero.webm" type="video/webm" />
          </video>
        </div>
      </div>
    </div>
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
  const [activeStep, setActiveStep] = useState(0);
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
  const heroShotParallax = useParallax<HTMLVideoElement>(14);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const cloudburstParallax = useParallax<HTMLImageElement>(14);

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
                Silk Board deep-dive
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

      {prefersReducedMotion ? (
        <div
          ref={heroShot.ref}
          className={`landing-shot landing-shot-hero reveal-scale${heroShot.visible ? " is-visible" : ""}`}
        >
          <img
            ref={heroShotParallax as never}
            src="/landing/flood-hero-poster.jpg"
            alt="Isometric illustration of a Bengaluru street intersection flooding and receding"
          />
        </div>
      ) : (
        <ScrollScrubVideo />
      )}

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
        <img
          ref={cloudburstParallax}
          src="/landing/cloudburst-overlay.jpg"
          alt="Cloudburst scenario showing watch and critical risk overlays across the network"
        />
        <p>A cloudburst scenario mid-run, watch and critical thresholds spreading across the network.</p>
      </Reveal>

      <section className="landing-section landing-steps">
        <Reveal as="div">
          <p className="eyebrow">How it works</p>
          <h2>From a static map to a live control room in three steps.</h2>
        </Reveal>
        <div className="landing-steps-layout">
          <div className="landing-step-list">
            {STEPS.map((step, index) => (
              <StepRow
                key={step.tag}
                step={step}
                index={index}
                delay={index * 90}
                isActive={activeStep === index}
                onActivate={setActiveStep}
              />
            ))}
          </div>
          <StepsVisual activeIndex={activeStep} />
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
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
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
