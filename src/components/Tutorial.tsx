import { useEffect, useRef } from "react";

type Step = {
  number: string;
  title: string;
  description: string;
  examples?: { code: string; note?: string }[];
  note?: string;
};

const steps: Step[] = [
  {
    number: "01",
    title: "Open the input bar",
    description:
      "Tap the input bar at the bottom of the screen. That's the only thing you ever need — no forms, no dropdowns, no timers to fight.",
  },
  {
    number: "02",
    title: "Type a set in plain English",
    description:
      "Coach Kettle's parser understands a wide range of formats. Just write what you lifted.",
    examples: [
      { code: "Bench 185 x 8" },
      { code: "Squat 225 3x5", note: "logs 3 sets of 5 reps at 225 lbs" },
    ],
  },
  {
    number: "03",
    title: "Use shorthand for speed",
    description:
      "After naming an exercise, just type the numbers for the next sets — Coach remembers the last exercise.",
    examples: [
      { code: "185 x 8", note: "uses your last exercise" },
    ],
  },
  {
    number: "04",
    title: "Log drop sets, supersets, and cardio",
    description:
      "Advanced formats are first-class. Type naturally and the parser handles the rest.",
    examples: [
      { code: "185, 165, 145 x 8", note: "drop set" },
      { code: "Bench 185 + Rows 135 x 8", note: "superset" },
      { code: "Run 20 min", note: "cardio" },
      { code: "Bench 60kg x 8", note: "kg auto-converts to lbs" },
    ],
    note:
      "If the parser can't interpret your input, it automatically falls back to AI parsing — so you can type naturally and Coach figures it out.",
  },
  {
    number: "05",
    title: "Attach photos and videos",
    description:
      "While in an active session, tap the camera icon to attach media from your library. Stored privately in your account — never publicly accessible.",
  },
  {
    number: "06",
    title: "Ask Coach Kettle",
    description:
      "Tap the coaching chat icon to open Coach Kettle. Ask anything — programming advice, form cues, rep ranges, recovery, nutrition. Coach has context about your recent workout history.",
  },
  {
    number: "07",
    title: "PRs detect themselves",
    description:
      "Personal records are detected and celebrated automatically. PR detection requires at least one previous logged set for the same exercise — first-time exercises won't trigger a PR.",
  },
];

function StepCard({ step, index }: { step: Step; index: number }) {
  return (
    <div
      className="tutorial-step relative flex flex-col gap-6 sm:flex-row sm:gap-10"
      style={{ transitionDelay: `${index * 80}ms` }}
    >
      {/* Left rail — number + connector */}
      <div className="relative flex shrink-0 flex-row items-center gap-4 sm:w-32 sm:flex-col sm:items-end sm:gap-0">
        <span className="text-[2.25rem] font-light tabular-nums tracking-tight text-white/[0.18] sm:text-[2.5rem]">
          {step.number}
        </span>
        <div className="h-px flex-1 bg-white/[0.05] sm:mt-3 sm:h-24 sm:w-px sm:flex-none" />
      </div>

      {/* Content card */}
      <div className="group relative flex-1">
        <div className="relative overflow-hidden rounded-2xl border border-brand-border bg-brand-card p-7 transition-all duration-500 hover:border-white/[0.12] sm:p-8">
          {/* Corner accents */}
          <div className="absolute right-4 top-4 h-6 w-px bg-white/[0.06] transition-all duration-500 group-hover:h-10 group-hover:bg-white/[0.12]" />
          <div className="absolute right-4 top-4 h-px w-6 bg-white/[0.06] transition-all duration-500 group-hover:w-10 group-hover:bg-white/[0.12]" />

          <h3 className="mb-3 text-lg font-semibold tracking-tight text-brand-text sm:text-xl">
            {step.title}
          </h3>
          <p className="text-[0.88rem] font-light leading-[1.75] text-brand-muted">
            {step.description}
          </p>

          {step.examples && (
            <div className="mt-5 space-y-2">
              {step.examples.map((ex) => (
                <div
                  key={ex.code}
                  className="flex items-center gap-3 overflow-x-auto rounded-lg border border-brand-border bg-brand-bg px-4 py-3"
                >
                  <span className="select-none text-[0.7rem] font-light text-white/25">
                    &gt;
                  </span>
                  <span className="whitespace-nowrap font-mono text-[0.85rem] text-brand-text">
                    {ex.code}
                  </span>
                  {ex.note && (
                    <span className="ml-auto whitespace-nowrap text-[0.7rem] font-light italic text-brand-muted">
                      {ex.note}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {step.note && (
            <p className="mt-5 border-t border-brand-border pt-4 text-[0.78rem] font-light leading-[1.7] text-brand-muted">
              {step.note}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Tutorial() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("in-view");
          observer.unobserve(el);
        }
      },
      { threshold: 0.05 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="tutorial" className="relative px-4 pb-16 pt-24 sm:px-8 lg:px-16">
      {/* Glow */}
      <div
        className="glow-orb"
        style={{
          width: 500,
          height: 500,
          top: "10%",
          left: "10%",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.025) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[900px]">
        {/* Intro */}
        <div className="mb-14 text-center sm:mb-16">
          <p className="mb-4 text-[0.7rem] font-medium tracking-[0.25em] text-white/35">
            HOW TO TALK TO COACH KETTLE
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            From install to your first PR.
            <br />
            <span className="text-brand-muted">In seven steps.</span>
          </h2>
          <div className="mx-auto mt-10 h-px max-w-[200px] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
        </div>

        {/* Steps */}
        <div ref={ref} className="tutorial-grid space-y-8 sm:space-y-12">
          {steps.map((step, i) => (
            <StepCard key={step.number} step={step} index={i} />
          ))}
        </div>

        {/* Closing line */}
        <div className="mx-auto mt-16 h-px max-w-[60%] bg-white/[0.04]" />
        <p className="mt-8 text-center text-[0.82rem] font-light leading-[1.8] text-brand-muted">
          Type what you lifted. Coach Kettle parses it, tracks your PRs,
          celebrates milestones, and coaches you — no forms, no friction.
        </p>
      </div>

      <style>{`
        .tutorial-grid .tutorial-step {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .tutorial-grid.in-view .tutorial-step {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
    </section>
  );
}
