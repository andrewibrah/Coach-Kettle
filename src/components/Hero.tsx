import { Link } from "react-router-dom";
import AppStoreBadge from "./AppStoreBadge";

export default function Hero() {
  return (
    <section className="mx-auto flex max-w-[680px] flex-col items-center px-5 pb-16 pt-20 text-center sm:px-6">
      <span className="mb-6 inline-block rounded-full border border-brand-border bg-brand-accent/15 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-brand-accent">
        iOS App
      </span>

      <h1 className="mb-4 text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl">
        Your <span className="text-brand-accent">AI-Powered</span>
        <br />
        Workout Coach
      </h1>

      <p className="mb-10 max-w-[520px] text-lg text-brand-muted">
        Log sets in plain English, track personal records with confetti, get AI
        coaching insights, and attach photos to every session — all from your
        pocket.
      </p>

      <div className="mb-10 flex flex-wrap justify-center gap-3">
        <Link
          to="/privacy"
          className="inline-flex items-center gap-2 rounded-xl border border-brand-accent bg-transparent px-6 py-3 text-[0.95rem] font-semibold text-brand-accent no-underline transition-colors hover:bg-brand-accent/10 active:scale-[0.97]"
        >
          Privacy Policy
        </Link>
        <Link
          to="/support"
          className="inline-flex items-center gap-2 rounded-xl border border-brand-accent bg-transparent px-6 py-3 text-[0.95rem] font-semibold text-brand-accent no-underline transition-colors hover:bg-brand-accent/10 active:scale-[0.97]"
        >
          Support
        </Link>
      </div>

      <AppStoreBadge />
    </section>
  );
}
