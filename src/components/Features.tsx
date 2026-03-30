const features = [
  {
    icon: "\u{1F4AC}",
    title: "Natural Language Logging",
    description:
      'Type "Bench 185 x 8" or "Squat 225 3x5" and Coach Kettle parses it instantly — no forms, no menus.',
  },
  {
    icon: "\u{1F3C6}",
    title: "PR Tracking & Confetti",
    description:
      "Every personal record is automatically detected and celebrated so you never miss a milestone.",
  },
  {
    icon: "\u{1F916}",
    title: "AI Coaching",
    description:
      "Ask your coach anything — programming advice, form cues, nutrition questions — powered by AI.",
  },
  {
    icon: "\u{1F4F8}",
    title: "Gym Photos & Videos",
    description:
      "Attach media to any workout session. Your content is stored privately and never publicly accessible.",
  },
  {
    icon: "\u{1F4C8}",
    title: "Workout History",
    description:
      "Browse every session, filter by body part, and see your progression over time at a glance.",
  },
  {
    icon: "\u26A1",
    title: "Fast & Gym-Friendly",
    description:
      "Built for the gym floor — minimal taps, big text, and instant logging so you stay focused on lifting.",
  },
];

export default function Features() {
  return (
    <section className="mx-auto grid max-w-[900px] grid-cols-1 gap-5 px-6 pb-16 pt-8 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((f) => (
        <div
          key={f.title}
          className="rounded-2xl border border-brand-border bg-brand-card p-6"
        >
          <div className="mb-3 text-3xl">{f.icon}</div>
          <h3 className="mb-1 text-base font-bold text-brand-text">
            {f.title}
          </h3>
          <p className="text-sm leading-relaxed text-brand-muted">
            {f.description}
          </p>
        </div>
      ))}
    </section>
  );
}
