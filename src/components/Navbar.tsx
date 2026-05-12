import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const { pathname } = useLocation();

  const linkClass = (path: string) =>
    `text-[0.8rem] tracking-[0.08em] transition-all duration-300 ${
      pathname === path
        ? "text-brand-text"
        : "text-brand-muted hover:text-brand-text"
    }`;

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
      <ul className="flex list-none gap-6 sm:hidden">
        <li>
          <Link to="/guide" className={linkClass("/guide")}>
            Guide
          </Link>
        </li>
        <li>
          <Link to="/privacy" className={linkClass("/privacy")}>
            Privacy
          </Link>
        </li>
        <li>
          <Link to="/support" className={linkClass("/support")}>
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
