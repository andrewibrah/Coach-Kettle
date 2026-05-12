import { Link } from "react-router-dom";
import { useEffect } from "react";
import Tutorial from "../components/Tutorial";

export default function Guide() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <div className="mx-auto max-w-[900px] px-6 pt-12">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
        >
          &larr; Back to Home
        </Link>
      </div>

      <Tutorial />

      <div className="mx-auto max-w-[900px] px-6 pb-16">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
          >
            &larr; Home
          </Link>
          <Link
            to="/support"
            className="text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
          >
            Support
          </Link>
          <Link
            to="/privacy"
            className="text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
          >
            Privacy
          </Link>
        </div>
      </div>
    </>
  );
}
