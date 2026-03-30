import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const { pathname } = useLocation();

  const linkClass = (path: string) =>
    `text-sm transition-colors ${
      pathname === path
        ? "text-brand-accent font-semibold"
        : "text-brand-muted hover:text-brand-accent"
    }`;

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-brand-border bg-brand-bg/95 px-6 py-4 backdrop-blur-sm sm:px-8">
      <Link
        to="/"
        className="text-xl font-bold tracking-tight text-brand-accent no-underline"
      >
        Coach Kettle
      </Link>
      <ul className="flex list-none gap-6">
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
    </nav>
  );
}
