import { Link } from "react-router-dom";
import { useEffect } from "react";

function FaqCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-xl border border-brand-border bg-brand-card p-6 max-sm:p-5">
      {children}
    </div>
  );
}

function QIcon({ char = "Q" }: { char?: string }) {
  return (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand-border bg-brand-bg text-[0.7rem] font-bold text-brand-muted">
      {char}
    </span>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="relative pl-5 text-sm text-brand-muted before:absolute before:left-1 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-muted">
      {children}
    </li>
  );
}

/* Monochrome SVG icons for tips section */
function TipIconSync() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
    </svg>
  );
}
function TipIconLock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export default function Support() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <>
      <div className="border-b border-brand-border bg-brand-card px-6 py-10 text-center">
        <h1 className="text-2xl font-bold uppercase tracking-[0.08em] sm:text-3xl">
          Support
        </h1>
        <p className="mt-2 text-sm text-brand-muted">
          Answers, tips, and how to reach us
        </p>
      </div>

      <div className="mx-auto max-w-[780px] px-6 pb-16 pt-12">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-1 text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
        >
          &larr; Back to Home
        </Link>

        {/* Pointer to Guide — logging how-tos live there now */}
        <div className="mb-10 rounded-xl border border-brand-border bg-brand-card p-6 max-sm:p-5">
          <p className="text-sm text-brand-muted">
            Looking for how to log sets, drop sets, supersets, shorthand, or
            how to talk to Coach Kettle? See the{" "}
            <Link
              to="/guide"
              className="text-brand-text underline decoration-brand-border underline-offset-2 hover:decoration-brand-text"
            >
              Get to Know Coach Kettle
            </Link>{" "}
            guide for the full walkthrough.
          </p>
        </div>

        {/* DATA & ACCOUNT */}
        <p className="mb-4 mt-10 text-[0.78rem] font-medium uppercase tracking-[0.15em] text-brand-muted">
          Data &amp; Account Management
        </p>

        <FaqCard>
          <h3 className="mb-2 flex items-start gap-2 text-base font-bold">
            <QIcon /> How do I delete my account and data?
          </h3>
          <p className="mb-2 text-sm text-brand-muted">
            You can request complete account and data deletion in two ways:
          </p>
          <ol className="mb-3 space-y-2 pl-5 text-sm text-brand-muted">
            <li className="relative pl-5 before:absolute before:left-0 before:font-bold before:text-brand-text before:content-['1.']">
              <strong>In-app:</strong> Go to Settings &rarr; Account &rarr;
              Delete Account. This will permanently delete your account and all
              associated data.
            </li>
            <li className="relative pl-5 before:absolute before:left-0 before:font-bold before:text-brand-text before:content-['2.']">
              <strong>By email:</strong> Send a deletion request to{" "}
              <a
                href="mailto:privacy@coachkettle.app"
                className="text-brand-text underline decoration-brand-border underline-offset-2 hover:decoration-brand-text"
              >
                privacy@coachkettle.app
              </a>{" "}
              from the email address associated with your account. We will
              process it within 30 days.
            </li>
          </ol>
          <p className="text-sm text-brand-muted">
            Deletion removes: your account, all workout sessions, PR records, and
            any attached photos or videos. This action is irreversible.
          </p>
        </FaqCard>

        <FaqCard>
          <h3 className="mb-2 flex items-start gap-2 text-base font-bold">
            <QIcon /> Can I export my workout data?
          </h3>
          <p className="text-sm text-brand-muted">
            Data export is on our roadmap. In the meantime, you can request a
            copy of your data by emailing{" "}
            <a
              href="mailto:privacy@coachkettle.app"
              className="text-brand-text underline decoration-brand-border underline-offset-2 hover:decoration-brand-text"
            >
              privacy@coachkettle.app
            </a>
            . We will provide it in JSON or CSV format within 30 days.
          </p>
        </FaqCard>

        <FaqCard>
          <h3 className="mb-2 flex items-start gap-2 text-base font-bold">
            <QIcon /> My session disappeared — what happened?
          </h3>
          <p className="mb-2 text-sm text-brand-muted">
            Coach Kettle saves data locally first (AsyncStorage) and then syncs
            to the cloud in the background. If you lose a session:
          </p>
          <ul className="space-y-2 pl-5">
            <Bullet>
              Check your workout history — the session may appear after
              reconnecting to the internet.
            </Bullet>
            <Bullet>
              If you were offline during logging, the data should still be saved
              locally and will sync when you reconnect.
            </Bullet>
            <Bullet>
              If data appears to be missing after syncing, contact support with
              the approximate date and time of the session.
            </Bullet>
          </ul>
        </FaqCard>

        {/* PRIVACY */}
        <p className="mb-4 mt-10 text-[0.78rem] font-medium uppercase tracking-[0.15em] text-brand-muted">
          Privacy Questions
        </p>

        <FaqCard>
          <h3 className="mb-2 flex items-start gap-2 text-base font-bold">
            <QIcon /> What data does Coach Kettle collect?
          </h3>
          <p className="mb-2 text-sm text-brand-muted">
            We collect your email address (via Apple Sign In), your fitness data
            (exercises, sets, reps, weights, timestamps), and any media you
            choose to attach. We do not collect location data, contacts, or any
            data unrelated to your workouts.
          </p>
          <p className="text-sm text-brand-muted">
            See our full{" "}
            <Link
              to="/privacy"
              className="text-brand-text underline decoration-brand-border underline-offset-2 hover:decoration-brand-text"
            >
              Privacy Policy
            </Link>{" "}
            for complete details.
          </p>
        </FaqCard>

        <FaqCard>
          <h3 className="mb-2 flex items-start gap-2 text-base font-bold">
            <QIcon /> Is my workout data shared or sold?
          </h3>
          <p className="text-sm text-brand-muted">
            No. We do not sell, rent, or share your personal data with
            advertisers or data brokers. Your data is shared only with our
            infrastructure providers (Supabase for storage, OpenAI for AI
            features) under strict data processing agreements.
          </p>
        </FaqCard>

        <FaqCard>
          <h3 className="mb-2 flex items-start gap-2 text-base font-bold">
            <QIcon /> Are my gym photos and videos private?
          </h3>
          <p className="text-sm text-brand-muted">
            Yes. Photos and videos are stored in a private Supabase Storage
            bucket. There are no public URLs for your media. Only you,
            authenticated with your account, can access your attached media.
          </p>
        </FaqCard>

        <FaqCard>
          <h3 className="mb-2 flex items-start gap-2 text-base font-bold">
            <QIcon /> What does Coach Kettle's AI see when I use it?
          </h3>
          <p className="text-sm text-brand-muted">
            The AI (powered by OpenAI) only receives the exercise text you type
            and any coaching questions you ask. Your email address, name, health
            metrics, and media files are never sent to OpenAI.
          </p>
        </FaqCard>

        {/* TIPS */}
        <p className="mb-4 mt-10 text-[0.78rem] font-medium uppercase tracking-[0.15em] text-brand-muted">
          Tips &amp; Known Limitations
        </p>

        <div className="mb-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-brand-border sm:grid-cols-2">
          {[
            {
              icon: <TipIconSync />,
              title: "Offline logging works",
              desc: "Sets are saved locally first. If you're offline at the gym, your data is safe and will sync when you reconnect.",
            },
            {
              icon: <TipIconLock />,
              title: "Session lock",
              desc: "Coach locks after 4 hours of inactivity. Use Face ID or Touch ID to unlock — your data is protected.",
            },
          ].map((tip) => (
            <div
              key={tip.title}
              className="bg-brand-card p-5"
            >
              <div className="mb-3 text-brand-muted">{tip.icon}</div>
              <h4 className="mb-1 text-sm font-medium text-brand-text">
                {tip.title}
              </h4>
              <p className="text-[0.82rem] leading-snug text-brand-muted">
                {tip.desc}
              </p>
            </div>
          ))}
        </div>

        <FaqCard>
          <h3 className="mb-2 flex items-start gap-2 text-base font-bold">
            <QIcon char="!" /> Known Limitations
          </h3>
          <ul className="space-y-2 pl-5">
            <Bullet>
              AI coaching requires an internet connection and may be slower during
              peak usage.
            </Bullet>
            <Bullet>
              Very complex input formats (e.g., tempo notation, RPE) may require
              AI parsing and slightly longer response times.
            </Bullet>
            <Bullet>
              Video attachments require sufficient storage space on your device
              and a stable connection to upload.
            </Bullet>
            <Bullet>
              Workout history search is chronological; full-text search across
              all exercises is coming in a future update.
            </Bullet>
            <Bullet>Apple Watch sync is not yet available.</Bullet>
          </ul>
        </FaqCard>

        {/* CONTACT */}
        <p className="mb-4 mt-10 text-[0.78rem] font-medium uppercase tracking-[0.15em] text-brand-muted">
          Contact Us
        </p>

        <div className="mb-5 rounded-xl border border-brand-border bg-brand-card p-7 max-sm:p-5">
          <h3 className="mb-2 text-base font-bold">Bug Reports &amp; Feature Requests</h3>
          <p className="mb-2 text-sm text-brand-muted">
            For general questions, bug reports, or feature requests, email our
            support address and we'll get back to you within 1-3 business days.
          </p>
          <p className="mb-2 text-sm text-brand-muted">
            When reporting a bug, please include:
          </p>
          <ul className="mb-4 space-y-2 pl-5">
            <Bullet>Your iOS version and Coach Kettle version</Bullet>
            <Bullet>Steps to reproduce the issue</Bullet>
            <Bullet>A screenshot or screen recording if applicable</Bullet>
          </ul>
          <a
            href="mailto:support@coachkettle.app"
            className="inline-flex items-center gap-2 rounded-lg border border-brand-border bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-brand-text no-underline transition-all hover:bg-white/[0.08]"
          >
            support@coachkettle.app
          </a>
        </div>

        <div className="mb-5 rounded-xl border border-brand-border bg-brand-card p-7 max-sm:p-5">
          <h3 className="mb-2 text-base font-bold">Privacy Requests</h3>
          <p className="mb-3 text-sm text-brand-muted">
            For data access, correction, deletion, or portability requests,
            contact our privacy team. We respond to all privacy requests within
            30 days.
          </p>
          <a
            href="mailto:privacy@coachkettle.app"
            className="inline-flex items-center gap-2 rounded-lg border border-brand-border bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-brand-text no-underline transition-all hover:bg-white/[0.08]"
          >
            privacy@coachkettle.app
          </a>
        </div>

        <div className="mb-8 rounded-xl border border-brand-border bg-brand-card p-7 max-sm:p-5">
          <h3 className="mb-4 text-base font-bold">Team</h3>
          <div className="space-y-3">
            <div className="rounded-lg border border-brand-border bg-brand-bg px-5 py-4">
              <p className="text-sm text-brand-muted">
                <strong className="text-brand-text">Andrew Ibrahem</strong>
                {" "}&mdash; Developer
              </p>
              <p className="mt-1 text-sm text-brand-muted">
                <a
                  href="mailto:andrew@coachkettle.app"
                  className="text-brand-text underline decoration-brand-border underline-offset-2 hover:decoration-brand-text"
                >
                  andrew@coachkettle.app
                </a>
              </p>
            </div>
            <div className="rounded-lg border border-brand-border bg-brand-bg px-5 py-4">
              <p className="text-sm text-brand-muted">
                <strong className="text-brand-text">Gabriel Gaglio</strong>
                {" "}&mdash; Co-Developer
              </p>
              <p className="mt-1 text-sm text-brand-muted">
                <a
                  href="mailto:gabe@coachkettle.com"
                  className="text-brand-text underline decoration-brand-border underline-offset-2 hover:decoration-brand-text"
                >
                  gabe@coachkettle.com
                </a>
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
          >
            &larr; Home
          </Link>
          <Link
            to="/privacy"
            className="text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
          >
            Privacy
          </Link>
          <Link
            to="/eula"
            className="text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
          >
            EULA
          </Link>
        </div>
      </div>
    </>
  );
}
