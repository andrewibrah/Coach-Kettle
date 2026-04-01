import { Link } from "react-router-dom";
import { useEffect } from "react";

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 rounded-xl border border-brand-border bg-brand-card p-7 max-sm:p-5">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-base font-bold text-brand-text">
      {children}
    </h2>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 rounded-lg border border-brand-border bg-brand-bg px-5 py-4">
      <p className="text-sm text-brand-text">{children}</p>
    </div>
  );
}

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-muted">
      {children}
    </li>
  );
}

export default function Privacy() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <>
      <div className="border-b border-brand-border bg-brand-card px-6 py-10 text-center">
        <h1 className="text-2xl font-bold uppercase tracking-[0.08em] sm:text-3xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-brand-muted">
          Effective date: March 29, 2026
        </p>
      </div>

      <div className="mx-auto max-w-[780px] px-6 pb-16 pt-12">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-1 text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
        >
          &larr; Back to Home
        </Link>

        {/* 1 */}
        <Section>
          <SectionTitle>1. Introduction</SectionTitle>
          <p className="mb-3 text-sm text-brand-muted">
            Coach Kettle ("we", "us", or "our") is an iOS workout tracking
            application developed and operated by Andrew Ibrahem. This Privacy
            Policy explains what information we collect, how we use it, who we
            share it with, and what rights you have regarding your personal data.
          </p>
          <p className="mb-3 text-sm text-brand-muted">
            By using Coach Kettle, you agree to the practices described in this
            policy. If you do not agree, please discontinue use of the app.
          </p>
          <p className="text-sm text-brand-muted">
            We are committed to compliance with the General Data Protection
            Regulation (GDPR), the California Consumer Privacy Act (CCPA/CPRA),
            and Apple App Store guidelines.
          </p>
        </Section>

        {/* 2 */}
        <Section>
          <SectionTitle>2. Data We Collect</SectionTitle>
          <p className="mb-3 text-sm text-brand-muted">
            We collect only what is necessary to provide and improve the app.
          </p>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Account Data
          </h3>
          <ul className="mb-4 space-y-2 pl-5 text-sm text-brand-muted">
            <BulletItem>
              <strong>Email address</strong> — collected via Apple Sign In during
              account creation.
            </BulletItem>
          </ul>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Fitness Data
          </h3>
          <ul className="mb-4 space-y-2 pl-5 text-sm text-brand-muted">
            {[
              "Exercise names, sets, reps, and weights",
              "Body part categories",
              "Workout session timestamps",
              "Personal records (PR) history",
            ].map((item) => (
              <BulletItem key={item}>{item}</BulletItem>
            ))}
          </ul>
          <p className="mb-4 text-sm text-brand-muted">
            This data is stored securely in your private account and is never
            shared with advertisers, data brokers, or analytics platforms.
          </p>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            User Content
          </h3>
          <ul className="mb-2 space-y-2 pl-5 text-sm text-brand-muted">
            <BulletItem>
              Photos and videos you choose to attach to workout sessions
            </BulletItem>
          </ul>
          <Highlight>
            Photos and videos are stored in a private storage bucket. Your media
            is never publicly accessible, never indexed, and never shared with
            any third party.
          </Highlight>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Technical Data
          </h3>
          <ul className="mb-4 space-y-2 pl-5 text-sm text-brand-muted">
            <BulletItem>
              Session tokens for authentication
            </BulletItem>
            <BulletItem>
              App version and OS version for crash reporting
            </BulletItem>
          </ul>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Data We Do NOT Collect
          </h3>
          <ul className="space-y-2 pl-5 text-sm text-brand-muted">
            {[
              "Location data",
              "Contacts or address book data",
              "Browsing or cross-app tracking data",
              "Payment or financial information",
            ].map((item) => (
              <BulletItem key={item}>{item}</BulletItem>
            ))}
          </ul>
        </Section>

        {/* 3 */}
        <Section>
          <SectionTitle>3. How We Use Your Data</SectionTitle>
          <div className="overflow-x-auto">
            <table className="my-3 w-full border-collapse text-sm">
              <thead>
                <tr>
                  {["Purpose", "Data Used", "Legal Basis (GDPR)"].map((h) => (
                    <th
                      key={h}
                      className="border-b border-brand-border bg-brand-bg px-3 py-2 text-left text-[0.75rem] font-medium uppercase tracking-wider text-brand-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-brand-muted">
                {[
                  ["Authenticate your account", "Email, session token", "Contract"],
                  ["Save and display workouts", "Fitness data, timestamps", "Contract"],
                  ["Detect personal records", "Exercise names, weights, reps", "Contract"],
                  ["Parse workout input via AI", "Exercise text (anonymized)", "Legitimate interest"],
                  ["AI coaching responses", "Text you provide", "Consent"],
                  ["Store media attachments", "Photos and videos", "Contract"],
                  ["Improve app reliability", "App/OS version (anonymized)", "Legitimate interest"],
                ].map(([purpose, data, basis]) => (
                  <tr
                    key={purpose}
                    className="border-b border-brand-border last:border-none"
                  >
                    <td className="px-3 py-2 align-top">{purpose}</td>
                    <td className="px-3 py-2 align-top">{data}</td>
                    <td className="px-3 py-2 align-top">{basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-brand-muted">
            We do not use your data for advertising, profiling, or sale to third
            parties.
          </p>
        </Section>

        {/* 4 */}
        <Section>
          <SectionTitle>4. Third-Party Services</SectionTitle>
          <p className="mb-3 text-sm text-brand-muted">
            We do not sell or trade your personal data. Data is shared only with
            the providers below to operate the app, under strict data processing
            agreements.
          </p>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Supabase
          </h3>
          <p className="mb-3 text-sm text-brand-muted">
            Database, authentication, and file storage. Data hosted in the
            United States.
          </p>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            OpenAI
          </h3>
          <p className="mb-1 text-sm text-brand-muted">
            Powers AI workout parsing and the coaching chat.
          </p>
          <Highlight>
            <strong>What we send to OpenAI:</strong> Only the exercise text you
            enter and coaching questions you type. We never transmit your email,
            name, health metrics, or media files.
          </Highlight>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Apple Sign In
          </h3>
          <p className="mb-3 text-sm text-brand-muted">
            Used for account creation and login. Apple may provide a real or
            relayed email address per your settings.
          </p>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Legal Disclosures
          </h3>
          <p className="text-sm text-brand-muted">
            We may disclose personal data if required by law, court order, or
            to protect the rights and safety of our users.
          </p>
        </Section>

        {/* 5 */}
        <Section>
          <SectionTitle>5. Data Storage &amp; Security</SectionTitle>
          <p className="mb-3 text-sm text-brand-muted">
            Your data is stored on infrastructure hosted in the United States
            with the following safeguards:
          </p>
          <ul className="mb-4 space-y-2 pl-5 text-sm text-brand-muted">
            {[
              "All data in transit encrypted via TLS/HTTPS",
              "Data at rest encrypted using AES-256",
              "Row-Level Security ensures users can only access their own data",
              "Media stored in private, access-controlled storage",
              "Biometric lock (Face ID / Touch ID) available",
            ].map((item) => (
              <BulletItem key={item}>{item}</BulletItem>
            ))}
          </ul>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Data Retention
          </h3>
          <p className="text-sm text-brand-muted">
            We retain your data while your account is active. Upon deletion, all
            data is permanently removed within 30 days, except where retention
            is required by law.
          </p>
        </Section>

        {/* 6 */}
        <Section>
          <SectionTitle>6. Your Rights</SectionTitle>

          <h3 className="mb-2 mt-3 text-[0.95rem] font-bold text-brand-text">
            All Users
          </h3>
          <ul className="mb-4 space-y-2 pl-5 text-sm text-brand-muted">
            <BulletItem>
              <strong>Access</strong> — request a copy of your data
            </BulletItem>
            <BulletItem>
              <strong>Correction</strong> — request correction of inaccurate data
            </BulletItem>
            <BulletItem>
              <strong>Deletion</strong> — delete your account in-app
              (Settings &rarr; Account &rarr; Delete Account) or by emailing{" "}
              <a
                href="mailto:privacy@coachkettle.app"
                className="text-brand-text underline decoration-brand-border underline-offset-2 hover:decoration-brand-text"
              >
                privacy@coachkettle.app
              </a>
            </BulletItem>
            <BulletItem>
              <strong>Portability</strong> — request your data in a
              machine-readable format
            </BulletItem>
          </ul>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            GDPR (EEA/UK)
          </h3>
          <p className="mb-3 text-sm text-brand-muted">
            You may also object to processing, request restriction, or withdraw
            consent at any time. You have the right to lodge a complaint with
            your local supervisory authority.
          </p>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            CCPA (California)
          </h3>
          <p className="mb-3 text-sm text-brand-muted">
            You have the right to know what data we collect and how it is used.{" "}
            <strong>We do not sell personal information.</strong> You have the
            right to non-discrimination for exercising your privacy rights.
          </p>

          <p className="text-sm text-brand-muted">
            To exercise any right, contact{" "}
            <a
              href="mailto:privacy@coachkettle.app"
              className="text-brand-text underline decoration-brand-border underline-offset-2 hover:decoration-brand-text"
            >
              privacy@coachkettle.app
            </a>
            . We respond within 30 days.
          </p>
        </Section>

        {/* 7 */}
        <Section>
          <SectionTitle>7. Children's Privacy</SectionTitle>
          <p className="text-sm text-brand-muted">
            Coach Kettle is not directed at children under 13 (or 16 in the
            EEA/UK). If you believe a child has provided us with personal data,
            contact{" "}
            <a
              href="mailto:privacy@coachkettle.app"
              className="text-brand-text underline decoration-brand-border underline-offset-2 hover:decoration-brand-text"
            >
              privacy@coachkettle.app
            </a>{" "}
            and we will promptly delete it.
          </p>
        </Section>

        {/* 8 */}
        <Section>
          <SectionTitle>8. Changes to This Policy</SectionTitle>
          <p className="text-sm text-brand-muted">
            We may update this policy from time to time. For material changes,
            we will notify you within the app or via email. Continued use after
            changes take effect constitutes acceptance.
          </p>
        </Section>

        {/* 9 */}
        <Section>
          <SectionTitle>9. Contact Us</SectionTitle>
          <p className="mb-4 text-sm text-brand-muted">
            If you have any questions, concerns, or requests regarding this
            Privacy Policy or your personal data, please contact us:
          </p>
          <div className="space-y-3">
            <div className="rounded-lg border border-brand-border bg-brand-bg px-5 py-4">
              <p className="text-sm text-brand-muted">
                <strong className="text-brand-text">Andrew Ibrahem</strong>
                {" "}&mdash; Developer, Coach Kettle
              </p>
              <p className="mt-1 text-sm text-brand-muted">
                General:{" "}
                <a
                  href="mailto:andrew@coachkettle.app"
                  className="text-brand-text underline decoration-brand-border underline-offset-2 hover:decoration-brand-text"
                >
                  andrew@coachkettle.app
                </a>
                {" "}&middot;{" "}
                Privacy:{" "}
                <a
                  href="mailto:privacy@coachkettle.app"
                  className="text-brand-text underline decoration-brand-border underline-offset-2 hover:decoration-brand-text"
                >
                  privacy@coachkettle.app
                </a>
              </p>
            </div>
            <div className="rounded-lg border border-brand-border bg-brand-bg px-5 py-4">
              <p className="text-sm text-brand-muted">
                <strong className="text-brand-text">Gabriel Gaglio</strong>
                {" "}&mdash; Co-Developer, Coach Kettle
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
        </Section>

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
