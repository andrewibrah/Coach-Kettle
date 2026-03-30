import { Link } from "react-router-dom";

export default function CTA() {
  return (
    <section className="px-6 pb-16 pt-12 text-center">
      <h2 className="mb-2 text-2xl font-bold">Questions or feedback?</h2>
      <p className="mb-6 text-[0.95rem] text-brand-muted">
        We're here to help. Reach out anytime.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          to="/support"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-accent px-6 py-3 text-[0.95rem] font-semibold text-white no-underline transition-colors hover:bg-brand-accent-hover active:scale-[0.97]"
        >
          Get Support
        </Link>
        <Link
          to="/privacy"
          className="inline-flex items-center gap-2 rounded-xl border border-brand-accent bg-transparent px-6 py-3 text-[0.95rem] font-semibold text-brand-accent no-underline transition-colors hover:bg-brand-accent/10 active:scale-[0.97]"
        >
          Privacy Policy
        </Link>
      </div>
    </section>
  );
}
