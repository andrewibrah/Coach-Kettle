import { useEffect, useRef } from "react";

const features = [
  {
    title: "Natural Language",
    description:
      'Type "Bench 185 x 8" or "Squat 225 3x5" — parsed instantly, no forms required.',
    rotation: "-1.5deg",
    offsetY: "0px",
  },
  {
    title: "PR Tracking",
    description:
      "Personal records detected and celebrated automatically. Never miss a milestone.",
    rotation: "1deg",
    offsetY: "-8px",
  },
  {
    title: "AI Coaching",
    description:
      "Get real-time lifting tips, form cues, and programming advice tailored to your workouts.",
    rotation: "-0.5deg",
    offsetY: "6px",
  },
  {
    title: "Gym Media",
    description:
      "Attach photos and videos to sessions. Stored privately, never publicly accessible.",
    rotation: "1.5deg",
    offsetY: "-6px",
  },
  {
    title: "History",
    description:
      "Browse sessions, filter by body part, see progression over time at a glance.",
    rotation: "-1deg",
    offsetY: "4px",
  },
  {
    title: "Gym-Friendly",
    description:
      "Minimal taps, big text, instant logging. Built for the gym floor.",
    rotation: "1deg",
    offsetY: "-10px",
  },
];

export default function Features() {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("in-view");
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="features" className="relative px-4 pb-16 pt-32 sm:px-8 lg:px-16">
      {/* Glow */}
      <div
        className="glow-orb"
        style={{
          width: 500,
          height: 500,
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(255,255,255,0.02) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[1200px]">
        <div className="mb-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Everything you need.
            <br />
            <span className="text-brand-muted">Nothing you don't.</span>
          </h2>
        </div>

        {/* Feature cards with staggered entrance */}
        <div
          ref={gridRef}
          className="feature-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((f, i) => (
            <div
              key={f.title}
              className="feature-card group relative"
              style={{
                transform: `rotate(${f.rotation}) translateY(${f.offsetY})`,
                transitionDelay: `${i * 100}ms`,
              }}
            >
              <div
                className="shimmer-hover tilt-card relative overflow-hidden rounded-2xl border border-brand-border bg-brand-card p-8 transition-all duration-500 hover:border-white/[0.15] hover:shadow-[0_12px_48px_rgba(255,255,255,0.04)]"
              >
                {/* Hover glow */}
                <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-white/[0.03] opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-100" />

                {/* Corner accents */}
                <div className="absolute right-4 top-4 h-8 w-px bg-white/[0.06] transition-all duration-500 group-hover:h-12 group-hover:bg-white/[0.12]" />
                <div className="absolute right-4 top-4 h-px w-8 bg-white/[0.06] transition-all duration-500 group-hover:w-12 group-hover:bg-white/[0.12]" />

                <div className="relative">
                  {/* Number row */}
                  <div className="mb-4 flex items-baseline gap-3">
                    <span className="text-[0.7rem] font-light tabular-nums tracking-wider text-white/20">
                      0{i + 1}
                    </span>
                    <div className="h-px flex-1 bg-white/[0.04] transition-all duration-500 group-hover:bg-white/[0.08]" />
                  </div>

                  <h3 className="mb-3 text-lg font-semibold tracking-wide text-brand-text">
                    {f.title}
                  </h3>
                  <p className="text-[0.82rem] font-light leading-[1.75] text-brand-muted">
                    {f.description}
                  </p>
                </div>
              </div>

              {/* Connector dot */}
              <div className="absolute -bottom-3 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/[0.08] transition-all duration-500 group-hover:bg-white/[0.25] group-hover:shadow-[0_0_12px_rgba(255,255,255,0.15)]" />
            </div>
          ))}
        </div>

        {/* Connecting line */}
        <div className="mx-auto mt-8 h-px max-w-[80%] bg-white/[0.03]" />
      </div>

      <style>{`
        .feature-grid .feature-card {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .feature-grid.in-view .feature-card {
          opacity: 1;
          transform: rotate(var(--r, 0deg)) translateY(var(--y, 0px));
        }
      `}</style>
    </section>
  );
}
