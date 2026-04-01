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

function CodeExample({ children }: { children: string }) {
  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-brand-border bg-brand-bg px-4 py-3 font-mono text-sm text-brand-text">
      {children}
    </div>
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
function TipIconBolt() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
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
function TipIconTrophy() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2" />
      <path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2" />
      <path d="M6 3h12v7a6 6 0 0 1-12 0V3z" />
      <path d="M12 16v2" />
      <path d="M8 21h8" />
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
function TipIconScale() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3l5 5-5 5" />
      <path d="M21 8H7" />
      <path d="M8 21l-5-5 5-5" />
      <path d="M3 16h14" />
    </svg>
  );
}
function TipIconCpu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
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

        {/* LOGGING WORKOUTS */}
        <p className="mb-4 text-[0.78rem] font-medium uppercase tracking-[0.15em] text-brand-muted">
          Logging Workouts
        </p>

        <FaqCard>
          <h3 className="mb-2 flex items-start gap-2 text-base font-bold">
            <QIcon /> How do I log a workout?
          </h3>
          <p className="mb-2 text-sm text-brand-muted">
            Tap the input bar at the bottom of the screen and type your set in
            plain English. Coach Kettle's parser understands a wide range of
            formats:
          </p>
          <CodeExample>Bench 185 x 8</CodeExample>
          <CodeExample>Squat 225 3x5</CodeExample>
          <CodeExample>185 x 8 &nbsp;&nbsp;&nbsp;(shorthand — uses your last exercise)</CodeExample>
          <CodeExample>185, 165, 145 x 8 &nbsp;&nbsp;&nbsp;(drop set)</CodeExample>
          <CodeExample>Bench 185 + Rows 135 x 8 &nbsp;&nbsp;&nbsp;(superset)</CodeExample>
          <CodeExample>Run 20 min &nbsp;&nbsp;&nbsp;(cardio)</CodeExample>
          <CodeExample>Bench 60kg x 8 &nbsp;&nbsp;&nbsp;(kg auto-converts to lbs)</CodeExample>
          <p className="text-sm text-brand-muted">
            If the parser can't interpret your input, it automatically falls back
            to AI parsing — so you can type naturally and the app figures it out.
          </p>
        </FaqCard>

        <FaqCard>
          <h3 className="mb-2 flex items-start gap-2 text-base font-bold">
            <QIcon /> How do I log multiple sets at once?
          </h3>
          <p className="mb-2 text-sm text-brand-muted">
            Use the multi-set format with a number before the "x":
          </p>
          <CodeExample>Bench 185 3x8 &nbsp;&nbsp;&nbsp;(logs 3 sets of 8 reps at 185 lbs)</CodeExample>
          <p className="text-sm text-brand-muted">
            Each set is saved as a separate row in your session, making it easy
            to review and edit individual sets.
          </p>
        </FaqCard>

        <FaqCard>
          <h3 className="mb-2 flex items-start gap-2 text-base font-bold">
            <QIcon /> How do I attach a photo or video to a session?
          </h3>
          <p className="text-sm text-brand-muted">
            While in an active workout session, tap the camera icon to attach
            media. You can add photos or videos from your library. Media is
            stored privately in your account and is never publicly accessible.
          </p>
        </FaqCard>

        <FaqCard>
          <h3 className="mb-2 flex items-start gap-2 text-base font-bold">
            <QIcon /> How does the AI coach work?
          </h3>
          <p className="mb-2 text-sm text-brand-muted">
            Tap the coaching chat icon to open the AI coach. You can ask anything
            — programming advice, form cues, rep ranges, recovery, nutrition, and
            more. The AI has context about your recent workout history to give
            more relevant answers.
          </p>
          <div className="my-3 rounded-lg border border-brand-border bg-brand-bg px-5 py-4">
            <p className="text-sm text-brand-text">
              Your email and personal identifiers are never sent to the AI. Only
              the exercise text and questions you type are transmitted.
            </p>
          </div>
        </FaqCard>

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
            <QIcon /> What does the AI see when I use it?
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

        <div className="mb-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-brand-border sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: <TipIconBolt />,
              title: "Use shorthand for speed",
              desc: 'After naming an exercise, just type "185 x 8" for subsequent sets — the app remembers the last exercise.',
            },
            {
              icon: <TipIconSync />,
              title: "Offline logging works",
              desc: "Sets are saved locally first. If you're offline at the gym, your data is safe and will sync when you reconnect.",
            },
            {
              icon: <TipIconTrophy />,
              title: "PRs need history",
              desc: "Personal record detection requires at least one previous logged set for the same exercise. First-time exercises won't trigger a PR.",
            },
            {
              icon: <TipIconLock />,
              title: "Session lock",
              desc: "The app locks after 4 hours of inactivity. Use Face ID or Touch ID to unlock — your data is protected.",
            },
            {
              icon: <TipIconScale />,
              title: "kg auto-converts",
              desc: 'Append "kg" to any weight and it converts to lbs automatically. E.g., "Bench 60kg x 8".',
            },
            {
              icon: <TipIconCpu />,
              title: "AI fallback",
              desc: "If the local parser doesn't recognize your input format, it's automatically sent to AI parsing — no action needed.",
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
            <Bullet>Your iOS version and app version</Bullet>
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
