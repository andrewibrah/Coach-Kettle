import { Link } from "react-router-dom";
import CoachLogo from "./CoachLogo";

export default function Footer() {
  return (
    <footer className="px-4 pb-6 sm:px-8 lg:px-16">
      <div className="mx-auto max-w-[1200px] border-t border-brand-border py-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <CoachLogo size={16} className="text-brand-muted" />
            <p className="text-[0.75rem] text-brand-muted">
              &copy; 2026 Coach Kettle &mdash; Andrew Ibrahem
            </p>
          </div>

          <div className="flex gap-8 text-[0.75rem]">
            <Link
              to="/privacy"
              className="text-brand-muted no-underline transition-colors duration-300 hover:text-brand-text"
            >
              Privacy
            </Link>
            <Link
              to="/support"
              className="text-brand-muted no-underline transition-colors duration-300 hover:text-brand-text"
            >
              Support
            </Link>
            <Link
              to="/eula"
              className="text-brand-muted no-underline transition-colors duration-300 hover:text-brand-text"
            >
              EULA
            </Link>
            <a
              href="mailto:andrew@coachkettle.app"
              className="text-brand-muted no-underline transition-colors duration-300 hover:text-brand-text"
            >
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
