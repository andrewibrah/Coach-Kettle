import { Link } from "react-router-dom";
import { useEffect } from "react";

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 rounded-2xl border border-brand-border bg-brand-card p-7 max-sm:p-5">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-brand-accent">
      {children}
    </h2>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 rounded-xl border border-brand-accent/30 bg-brand-accent/10 px-5 py-4">
      <p className="text-sm text-brand-text">{children}</p>
    </div>
  );
}

export default function Privacy() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <>
      <div className="border-b border-brand-border bg-brand-card px-6 py-10 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-brand-muted">
          Effective date: March 29, 2026
        </p>
      </div>

      <div className="mx-auto max-w-[780px] px-6 pb-16 pt-12">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-1 text-sm font-semibold text-brand-accent no-underline transition-opacity hover:opacity-80"
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
            By using Coach Kettle (Bundle&nbsp;ID:{" "}
            <code className="text-brand-text">com.coachkettle.coachkettle</code>
            ), you agree to the practices described in this policy. If you do not
            agree, please discontinue use of the app.
          </p>
          <p className="text-sm text-brand-muted">
            We are committed to compliance with applicable privacy laws including
            the General Data Protection Regulation (GDPR), the California
            Consumer Privacy Act (CCPA/CPRA), and the Apple App Store guidelines.
          </p>
        </Section>

        {/* 2 */}
        <Section>
          <SectionTitle>2. Data We Collect</SectionTitle>
          <p className="mb-3 text-sm text-brand-muted">
            We collect only what is necessary to provide and improve the app.
            Below is a complete breakdown:
          </p>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Account Data
          </h3>
          <ul className="mb-4 space-y-2 pl-5 text-sm text-brand-muted">
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent">
              <strong>Email address</strong> — collected via Apple Sign In during
              account creation. We do not collect your Apple ID password or any
              other Apple account credentials.
            </li>
          </ul>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Fitness &amp; Health Data
          </h3>
          <ul className="mb-4 space-y-2 pl-5 text-sm text-brand-muted">
            {[
              'Exercise names (e.g., "Bench Press", "Squat")',
              "Sets, reps, and weights (in lbs or kg)",
              "Body part categories (e.g., Push, Pull, Legs)",
              "Workout session timestamps and dates",
              "Personal records (PR) history",
              "Workout frequency patterns",
            ].map((item) => (
              <li
                key={item}
                className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent"
              >
                {item}
              </li>
            ))}
          </ul>
          <p className="mb-4 text-sm text-brand-muted">
            This data constitutes health and fitness information. It is stored
            securely in your private account and is never shared with
            advertisers, data brokers, or analytics platforms.
          </p>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            User Content
          </h3>
          <ul className="mb-2 space-y-2 pl-5 text-sm text-brand-muted">
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent">
              Photos and videos you choose to attach to workout sessions
            </li>
          </ul>
          <Highlight>
            <strong>Important:</strong> Photos and videos are stored in a private
            Supabase Storage bucket. Your media is never publicly accessible,
            never indexed, and never shared with any third party. Only you can
            access your attached media through your authenticated account.
          </Highlight>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Technical / Device Data
          </h3>
          <ul className="mb-4 space-y-2 pl-5 text-sm text-brand-muted">
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent">
              Supabase anonymous session tokens (used for authentication state
              management)
            </li>
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent">
              App version and OS version (collected automatically by
              Expo/React&nbsp;Native for crash reporting purposes only)
            </li>
          </ul>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Data We Do NOT Collect
          </h3>
          <ul className="space-y-2 pl-5 text-sm text-brand-muted">
            {[
              "Precise or approximate location data",
              "Contacts or address book data",
              "Browsing history or cross-app tracking data",
              "Payment or financial information",
              "Microphone, camera, or sensor data beyond media you explicitly attach",
            ].map((item) => (
              <li
                key={item}
                className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent"
              >
                {item}
              </li>
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
                      className="bg-brand-accent/15 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-brand-accent"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-brand-muted">
                {[
                  ["Authenticate your account", "Email address, session token", "Performance of a contract"],
                  ["Save and display your workouts", "Fitness data, timestamps", "Performance of a contract"],
                  ["Detect and celebrate personal records", "Exercise names, weights, reps", "Performance of a contract"],
                  ["Parse workout input via AI", "Exercise text only (anonymized)", "Legitimate interest"],
                  ["Provide AI coaching responses", "Workout context text you provide", "Legitimate interest / Consent"],
                  ["Store and retrieve media attachments", "Photos and videos you attach", "Performance of a contract"],
                  ["Improve app reliability", "App version, OS version (anonymized)", "Legitimate interest"],
                ].map(([purpose, data, basis]) => (
                  <tr
                    key={purpose}
                    className="border-b border-brand-accent/10 last:border-none"
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
            parties under any circumstances.
          </p>
        </Section>

        {/* 4 */}
        <Section>
          <SectionTitle>4. Data Sharing &amp; Third-Party Services</SectionTitle>
          <p className="mb-3 text-sm text-brand-muted">
            We do not sell, rent, or trade your personal data. We share data only
            with the service providers listed below, solely to operate the app,
            and under strict data processing agreements.
          </p>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Supabase
          </h3>
          <p className="mb-3 text-sm text-brand-muted">
            Supabase provides our database, authentication, file storage, and
            server-side edge functions. Your workout data and media are stored on
            Supabase-managed infrastructure hosted in the United States. Supabase
            processes data as a data processor on our behalf.
            <br />
            Privacy policy:{" "}
            <a
              href="https://supabase.com/privacy"
              className="text-brand-accent no-underline hover:underline"
            >
              supabase.com/privacy
            </a>
          </p>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            OpenAI
          </h3>
          <p className="mb-1 text-sm text-brand-muted">
            We use OpenAI's API for two features: AI workout text parsing and the
            AI coaching chat interface.
          </p>
          <Highlight>
            <strong>What we send to OpenAI:</strong> Exercise log text you enter
            (e.g., "Bench 185 x 8") and coaching questions you type. We never
            transmit your name, email address, health metrics, media files, or
            any personally identifying information to OpenAI. Inputs are sent as
            anonymous text strings only.
          </Highlight>
          <p className="text-sm text-brand-muted">
            OpenAI may retain API inputs per their data usage policies.
            <br />
            Privacy policy:{" "}
            <a
              href="https://openai.com/privacy"
              className="text-brand-accent no-underline hover:underline"
            >
              openai.com/privacy
            </a>
          </p>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Apple Sign In
          </h3>
          <p className="mb-3 text-sm text-brand-muted">
            Account creation and login use Apple's Sign In with Apple service.
            Apple may provide us with a real or relayed email address per your
            Apple ID settings. We do not receive your Apple ID password.
            <br />
            Privacy policy:{" "}
            <a
              href="https://www.apple.com/legal/privacy/"
              className="text-brand-accent no-underline hover:underline"
            >
              apple.com/legal/privacy
            </a>
          </p>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Expo / React Native
          </h3>
          <p className="mb-3 text-sm text-brand-muted">
            The app is built with Expo and React Native. Expo may collect
            anonymized crash and diagnostic data to improve framework stability.
            This data does not include your personal workout information.
            <br />
            Privacy policy:{" "}
            <a
              href="https://expo.dev/privacy"
              className="text-brand-accent no-underline hover:underline"
            >
              expo.dev/privacy
            </a>
          </p>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Legal Disclosures
          </h3>
          <p className="text-sm text-brand-muted">
            We may disclose personal data if required by applicable law, court
            order, or governmental authority, or where necessary to protect the
            rights, property, or safety of Coach Kettle, our users, or the
            public.
          </p>
        </Section>

        {/* 5 */}
        <Section>
          <SectionTitle>5. Data Storage &amp; Security</SectionTitle>
          <p className="mb-3 text-sm text-brand-muted">
            Your data is stored in Supabase's managed infrastructure located in
            the United States. We implement the following safeguards:
          </p>
          <ul className="mb-4 space-y-2 pl-5 text-sm text-brand-muted">
            {[
              "All data in transit is encrypted via TLS/HTTPS",
              "Data at rest is encrypted by Supabase using AES-256",
              "Authentication uses short-lived JWT tokens and Row-Level Security (RLS) policies so users can only access their own data",
              "Media files are stored in a private, access-controlled Supabase Storage bucket — no public URLs exist for your media",
              "Biometric authentication (Face ID / Touch ID) is available to lock the app after inactivity",
            ].map((item) => (
              <li
                key={item}
                className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent"
              >
                {item}
              </li>
            ))}
          </ul>
          <p className="mb-4 text-sm text-brand-muted">
            No method of transmission or storage is 100% secure. In the event of
            a data breach that affects your personal information, we will notify
            you as required by applicable law.
          </p>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            Data Retention
          </h3>
          <p className="text-sm text-brand-muted">
            We retain your data for as long as your account is active. If you
            delete your account, all associated personal data, workout records,
            and media attachments are permanently deleted from our systems within
            30 days, except where retention is required by law.
          </p>
        </Section>

        {/* 6 */}
        <Section>
          <SectionTitle>6. Your Rights</SectionTitle>
          <p className="mb-3 text-sm text-brand-muted">
            Depending on your jurisdiction, you may have the following rights
            regarding your personal data:
          </p>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            For All Users
          </h3>
          <ul className="mb-4 space-y-2 pl-5 text-sm text-brand-muted">
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent">
              <strong>Access:</strong> Request a copy of the personal data we
              hold about you.
            </li>
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent">
              <strong>Correction:</strong> Request correction of inaccurate data.
            </li>
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent">
              <strong>Deletion:</strong> Request deletion of your account and all
              associated data ("right to be forgotten"). You can request this
              in-app (Settings &rarr; Account &rarr; Delete Account) or by
              emailing{" "}
              <a
                href="mailto:privacy@coachkettle.app"
                className="text-brand-accent"
              >
                privacy@coachkettle.app
              </a>
              .
            </li>
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent">
              <strong>Portability:</strong> Request your workout data in a
              machine-readable format.
            </li>
          </ul>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            GDPR (EEA/UK Residents)
          </h3>
          <ul className="mb-4 space-y-2 pl-5 text-sm text-brand-muted">
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent">
              <strong>Objection:</strong> Object to processing based on
              legitimate interests.
            </li>
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent">
              <strong>Restriction:</strong> Request that we restrict processing
              of your data in certain circumstances.
            </li>
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent">
              <strong>Withdraw Consent:</strong> Where processing is based on
              consent, you may withdraw it at any time.
            </li>
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent">
              You have the right to lodge a complaint with your local supervisory
              authority.
            </li>
          </ul>

          <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
            CCPA (California Residents)
          </h3>
          <ul className="mb-4 space-y-2 pl-5 text-sm text-brand-muted">
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent">
              You have the right to know what personal information we collect and
              how it is used.
            </li>
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent">
              You have the right to opt out of the sale of personal information.{" "}
              <strong>We do not sell personal information.</strong>
            </li>
            <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-accent">
              You have the right to non-discrimination for exercising your
              privacy rights.
            </li>
          </ul>
          <p className="text-sm text-brand-muted">
            To exercise any of these rights, contact us at{" "}
            <a
              href="mailto:privacy@coachkettle.app"
              className="text-brand-accent"
            >
              privacy@coachkettle.app
            </a>
            . We will respond within 30 days (or sooner as required by law).
          </p>
        </Section>

        {/* 7 */}
        <Section>
          <SectionTitle>7. Children's Privacy</SectionTitle>
          <p className="text-sm text-brand-muted">
            Coach Kettle is not directed at children under the age of 13 (or 16
            in the EEA/UK). We do not knowingly collect personal information from
            children. If you believe a child has provided us with personal data,
            please contact us at{" "}
            <a
              href="mailto:privacy@coachkettle.app"
              className="text-brand-accent"
            >
              privacy@coachkettle.app
            </a>{" "}
            and we will promptly delete that information.
          </p>
        </Section>

        {/* 8 */}
        <Section>
          <SectionTitle>8. Changes to This Policy</SectionTitle>
          <p className="mb-3 text-sm text-brand-muted">
            We may update this Privacy Policy from time to time. When we do, we
            will revise the effective date at the top of this page and, for
            material changes, provide notice within the app or via email. We
            encourage you to review this policy periodically.
          </p>
          <p className="text-sm text-brand-muted">
            Continued use of Coach Kettle after changes take effect constitutes
            acceptance of the updated policy.
          </p>
        </Section>

        {/* 9 */}
        <Section>
          <SectionTitle>9. Contact Us</SectionTitle>
          <p className="mb-3 text-sm text-brand-muted">
            If you have any questions, concerns, or requests regarding this
            Privacy Policy or your personal data, please contact us:
          </p>
          <div className="rounded-xl border border-brand-border bg-brand-accent/[0.08] px-5 py-4">
            <p className="text-sm text-brand-muted">
              <strong className="text-brand-text">Andrew Ibrahem</strong>
            </p>
            <p className="text-sm text-brand-muted">Developer, Coach Kettle</p>
            <p className="text-sm text-brand-muted">
              General inquiries:{" "}
              <a
                href="mailto:andrew@coachkettle.app"
                className="text-brand-accent no-underline hover:underline"
              >
                andrew@coachkettle.app
              </a>
            </p>
            <p className="text-sm text-brand-muted">
              Privacy requests:{" "}
              <a
                href="mailto:privacy@coachkettle.app"
                className="text-brand-accent no-underline hover:underline"
              >
                privacy@coachkettle.app
              </a>
            </p>
          </div>
        </Section>

        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-accent no-underline transition-opacity hover:opacity-80"
        >
          &larr; Back to Home
        </Link>
      </div>
    </>
  );
}
