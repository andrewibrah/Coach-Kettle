import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-brand-border py-8 text-center text-[0.82rem] text-brand-muted">
      <div className="mb-3 flex justify-center gap-6">
        <Link to="/" className="text-brand-muted no-underline hover:text-brand-accent">
          Home
        </Link>
        <Link
          to="/privacy"
          className="text-brand-muted no-underline hover:text-brand-accent"
        >
          Privacy Policy
        </Link>
        <Link
          to="/support"
          className="text-brand-muted no-underline hover:text-brand-accent"
        >
          Support
        </Link>
        <a
          href="mailto:andrew@coachkettle.app"
          className="text-brand-muted no-underline hover:text-brand-accent"
        >
          Contact
        </a>
      </div>
      <p>&copy; 2026 Coach Kettle &mdash; Andrew Ibrahem. All rights reserved.</p>
    </footer>
  );
}
