import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const { pathname } = useLocation();

  // SC 1.4.1: the mobile nav marked the current page with colour alone
  // (brand-text vs brand-muted). Add an underline as a redundant,
  // non-colour channel. The desktop pill nav already carries a background
  // change, so colour is not its sole indicator.
  const linkClass = (path: string) =>
    `text-[0.8rem] tracking-[0.08em] transition-all duration-300 ${
      pathname === path
        ? "text-brand-text underline decoration-2 underline-offset-4"
        : "text-brand-muted no-underline hover:text-brand-text"
    }`;

  // SC 4.1.2: expose the current page programmatically.
  const current = (path: string) =>
    pathname === path ? ("page" as const) : undefined;

  return (
    <nav className="animate-slide-down sticky top-0 z-50 flex items-center justify-between bg-brand-bg/80 px-6 py-4 backdrop-blur-xl sm:px-10 lg:px-16">
      <Link
        to="/"
        className="text-[0.85rem] font-medium tracking-[0.06em] text-brand-text no-underline transition-opacity duration-300 hover:opacity-70"
      >
        Coach Kettle
      </Link>

      {/* Center pill nav */}
      <div className="hidden rounded-full border border-brand-border bg-brand-card/50 px-1 py-1 sm:flex">
        <Link
          to="/"
          aria-current={current("/")}
          className={`rounded-full px-4 py-1.5 text-[0.78rem] tracking-[0.06em] no-underline transition-all duration-300 ${
            pathname === "/"
              ? "bg-white/[0.06] text-brand-text"
              : "text-brand-muted hover:text-brand-text"
          }`}
        >
          Home
        </Link>
        <Link
          to="/guide"
          aria-current={current("/guide")}
          className={`rounded-full px-4 py-1.5 text-[0.78rem] tracking-[0.06em] no-underline transition-all duration-300 ${
            pathname === "/guide"
              ? "bg-white/[0.06] text-brand-text"
              : "text-brand-muted hover:text-brand-text"
          }`}
        >
          Guide
        </Link>
        <Link
          to="/privacy"
          aria-current={current("/privacy")}
          className={`rounded-full px-4 py-1.5 text-[0.78rem] tracking-[0.06em] no-underline transition-all duration-300 ${
            pathname === "/privacy"
              ? "bg-white/[0.06] text-brand-text"
              : "text-brand-muted hover:text-brand-text"
          }`}
        >
          Privacy
        </Link>
        <Link
          to="/support"
          aria-current={current("/support")}
          className={`rounded-full px-4 py-1.5 text-[0.78rem] tracking-[0.06em] no-underline transition-all duration-300 ${
            pathname === "/support"
              ? "bg-white/[0.06] text-brand-text"
              : "text-brand-muted hover:text-brand-text"
          }`}
        >
          Support
        </Link>
      </div>

      {/* Mobile fallback links */}
      <ul role="list" className="flex list-none gap-6 sm:hidden">
        <li>
          <Link to="/guide" aria-current={current("/guide")} className={linkClass("/guide")}>
            Guide
          </Link>
        </li>
        <li>
          <Link to="/privacy" aria-current={current("/privacy")} className={linkClass("/privacy")}>
            Privacy
          </Link>
        </li>
        <li>
          <Link to="/support" aria-current={current("/support")} className={linkClass("/support")}>
            Support
          </Link>
        </li>
      </ul>

      {/* Download CTA */}
      <a
        href="https://apps.apple.com/us/app/coach-kettle/id6759267330"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden rounded-full bg-white px-5 py-2 text-[0.78rem] font-medium text-black no-underline transition-all duration-300 hover:bg-white/85 sm:inline-flex"
      >
        Download App
      </a>
    </nav>
  );
}
