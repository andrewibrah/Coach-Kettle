import { Link } from "react-router-dom";
import { useEffect } from "react";

// Mirrors the in-app policy in the app repo (constants/legal.ts,
// PRIVACY_VERSION / PRIVACY_LAST_UPDATED / CONSENT_AI_DISCLOSURE). Keep the two
// in sync: App Store Connect links here as the app's privacy policy URL.
const PRIVACY_VERSION = "1.1.0";
const PRIVACY_LAST_UPDATED = "September 24, 2026";

const mailLink =
  "text-brand-text underline decoration-brand-border underline-offset-2 hover:decoration-brand-text";

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

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
      {children}
    </h3>
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

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul role="list" className="mb-4 space-y-2 pl-5 text-sm text-brand-muted">
      {items.map((item, i) => (
        <BulletItem key={i}>{item}</BulletItem>
      ))}
    </ul>
  );
}

function PrivacyEmail() {
  return (
    <a href="mailto:privacy@coachkettle.app" className={mailLink}>
      privacy@coachkettle.app
    </a>
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
          Version {PRIVACY_VERSION} &middot; Last updated {PRIVACY_LAST_UPDATED}
        </p>
      </div>

      <div className="mx-auto max-w-[780px] px-6 pb-16 pt-12">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-1 py-2 text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
        >
          &larr; Back to Home
        </Link>

        {/* 1 */}
        <Section>
          <SectionTitle>1. Introduction</SectionTitle>
          <p className="mb-3 text-sm text-brand-muted">
            Coach Kettle ("we", "us", or "our") is an iOS workout, nutrition,
            and coaching app developed and operated by Andrew Ibrahem. Your
            privacy matters. This policy explains exactly what data we collect,
            who we share it with, and why.
          </p>
          <p className="text-sm text-brand-muted">
            This is the same policy you accept inside the app. By using Coach
            Kettle, you agree to the practices described here. If you do not
            agree, please discontinue use of Coach Kettle.
          </p>
        </Section>

        {/* 2 */}
        <Section>
          <SectionTitle>2. Data We Collect</SectionTitle>

          <SubTitle>Account Information</SubTitle>
          <BulletList
            items={[
              "Email address (to identify your account)",
              "Authentication provider (Apple, Google, or email)",
            ]}
          />

          <SubTitle>Workout Data</SubTitle>
          <BulletList
            items={[
              "Exercise names, sets, reps, and weights you log",
              "Cardio details you log, such as distance, calories, and heart rate",
              "Dates and times of workouts",
              "Any notes or reflections you add",
              "Personal records, templates, and programs",
            ]}
          />

          <SubTitle>Profile, Body, and Nutrition Data</SubTitle>
          <BulletList
            items={[
              "Profile details you enter: date of birth, sex, height, weight, goal weight, fitness focus, activity level, and equipment",
              "Body measurements, resting heart rate, and progress photos you add",
              "Food logs, nutrition targets, meal plans, dietary preferences, allergies, and disliked foods",
            ]}
          />

          <SubTitle>Photos and Media</SubTitle>
          <BulletList
            items={[
              "Photos and videos you attach to workouts, and progress photos, kept in private storage",
              "Meal photos you choose to analyze are sent to OpenAI for that request and are not stored",
            ]}
          />

          <SubTitle>AI Chat Data</SubTitle>
          <BulletList
            items={[
              "Messages you send to the AI coach",
              "AI responses (for conversation continuity)",
            ]}
          />

          <SubTitle>Technical Data</SubTitle>
          <BulletList
            items={[
              "Device type and operating system",
              "App version",
              "Server error logs",
              "Your IP address: our hosting and auth provider processes it to operate and secure the service, and we record it with your device's user agent when you accept these terms",
              "In-app feature usage events (kept by us, not shared with analytics companies)",
              "Your push notification token, if you turn on notifications",
            ]}
          />

          <SubTitle>Data We Don't Collect</SubTitle>
          <BulletList
            items={[
              <><strong>Location data</strong>: we don't track where you work out</>,
              <><strong>Health app data</strong>: we don't sync with Apple Health or Google Fit</>,
              <><strong>Contacts</strong>: we don't access your address book</>,
            ]}
          />
        </Section>

        {/* 3 */}
        <Section>
          <SectionTitle>3. How We Use Your Data</SectionTitle>
          <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm text-brand-muted">
            <li><strong>Provide the service</strong>: store and display your workouts, nutrition, and progress</li>
            <li><strong>Improve the app</strong>: understand usage patterns to make better features</li>
            <li><strong>Customer support</strong>: help you if something goes wrong</li>
            <li><strong>Security</strong>: detect and prevent abuse</li>
          </ol>
          <p className="text-sm text-brand-muted">
            We do not sell your personal data, and we do not use it for
            advertising. Coach Kettle has no ads.
          </p>
        </Section>

        {/* 4 */}
        <Section>
          <SectionTitle>4. AI Features (OpenAI)</SectionTitle>
          <p className="mb-3 text-sm text-brand-muted">
            To power AI features, Coach Kettle sends the content needed for each
            request to OpenAI: your workout text and current session, your coach
            questions and recent chat, meal descriptions or meal photos you
            choose to analyze, and, for coaching and meal plans, relevant profile
            and training details (such as age and date of birth, sex, height,
            weight and goals, dietary preferences and allergies, recent workouts
            including any heart rate you log, personal records, nutrition targets
            and recent food logs).
          </p>
          <Highlight>
            We do not send your name, email, or account ID to OpenAI.
          </Highlight>
          <p className="text-sm text-brand-muted">
            OpenAI processes this data to generate the response, under its API
            data usage policies. The app asks you to accept this disclosure
            before you use AI features.
          </p>
        </Section>

        {/* 5 */}
        <Section>
          <SectionTitle>5. Third Parties</SectionTitle>
          <p className="mb-3 text-sm text-brand-muted">
            We use these service providers to operate Coach Kettle:
          </p>
          <BulletList
            items={[
              <><strong>Supabase</strong>: database, authentication, file storage, and server functions (supabase.com)</>,
              <><strong>OpenAI</strong>: AI features, as described above (openai.com)</>,
              <><strong>RevenueCat</strong>: subscription management. Receives your account ID, purchase history, and email address (revenuecat.com)</>,
              <><strong>Apple</strong>: App Store purchases and Sign in with Apple (apple.com)</>,
              <><strong>Google</strong>: Google Sign-In (google.com)</>,
              <><strong>Expo</strong>: push notification delivery. Receives your push token and the notification text (expo.dev)</>,
              <><strong>Open Food Facts</strong>: barcode lookups. Only the barcode is sent, with no personal data (openfoodfacts.org)</>,
            ]}
          />
          <p className="mb-3 text-sm text-brand-muted">
            These providers have their own privacy policies and security
            practices.
          </p>
          <SubTitle>Legal Disclosures</SubTitle>
          <p className="text-sm text-brand-muted">
            We may disclose personal data if required by law, court order, or
            to protect the rights and safety of our users.
          </p>
        </Section>

        {/* 6 */}
        <Section>
          <SectionTitle>6. Data Storage &amp; Security</SectionTitle>
          <BulletList
            items={[
              "All data is encrypted in transit (HTTPS/TLS)",
              "Data is stored on Supabase infrastructure with encryption at rest",
              "Photos and videos are kept in private, access-controlled storage",
              "Access to production data is restricted to essential personnel",
            ]}
          />
        </Section>

        {/* 7 */}
        <Section>
          <SectionTitle>7. Deleting Your Account</SectionTitle>
          <p className="mb-3 text-sm text-brand-muted">
            In Coach Kettle 1.0.2 or later, go to{" "}
            <strong>Settings &rarr; Delete Account</strong> and confirm by
            signing in again. Deletion permanently removes:
          </p>
          <BulletList
            items={[
              "Your sign-in account",
              "Your app data: profile, workouts, nutrition, coach history, programs, and personal records",
              "Photos and videos you stored",
              "Your RevenueCat subscriber record",
            ]}
          />
          <Highlight>
            Deleting your account <strong>does not cancel an App Store
            subscription</strong>. Cancel it in your Apple ID subscription
            settings, or from Manage Subscription in the app, before you delete.
          </Highlight>
          <p className="mb-3 text-sm text-brand-muted">
            A record of past purchase events, with your account link and
            personal details removed, may be kept for accounting. Copies in
            encrypted backups expire on our database provider's backup schedule.
          </p>
          <p className="text-sm text-brand-muted">
            On an older version of the app, or if you can't sign in, email a
            deletion request to <PrivacyEmail /> from the address on your
            account.
          </p>
        </Section>

        {/* 8 */}
        <Section>
          <SectionTitle>8. Your Rights</SectionTitle>
          <BulletList
            items={[
              <><strong>Access</strong> your data at any time through the app</>,
              <><strong>Export</strong> your workout history (in-app export coming soon; until then, email us for a copy)</>,
              <><strong>Delete</strong> your account and data in the app: Settings &rarr; Delete Account</>,
              <><strong>Opt out</strong> of optional features</>,
            ]}
          />

          <SubTitle>California Privacy Rights (CCPA)</SubTitle>
          <p className="mb-3 text-sm text-brand-muted">
            California residents have additional rights, including the right to
            know what data we collect, the right to delete personal
            information, and the right to non-discrimination for exercising
            these rights. <strong>We do not sell personal information.</strong>
          </p>

          <SubTitle>EEA / UK</SubTitle>
          <p className="mb-3 text-sm text-brand-muted">
            You may also object to processing, request restriction, or withdraw
            consent at any time, and you have the right to lodge a complaint
            with your local supervisory authority.
          </p>

          <p className="text-sm text-brand-muted">
            To exercise any right, contact <PrivacyEmail />.
          </p>
        </Section>

        {/* 9 */}
        <Section>
          <SectionTitle>9. Children's Privacy</SectionTitle>
          <p className="text-sm text-brand-muted">
            Coach Kettle is not intended for children under 13. We don't
            knowingly collect data from children. If you believe a child has
            provided us with personal data, contact <PrivacyEmail />.
          </p>
        </Section>

        {/* 10 */}
        <Section>
          <SectionTitle>10. International Users</SectionTitle>
          <p className="text-sm text-brand-muted">
            Data may be processed in the United States. By using the app, you
            consent to this transfer.
          </p>
        </Section>

        {/* 11 */}
        <Section>
          <SectionTitle>11. Changes to This Policy</SectionTitle>
          <p className="text-sm text-brand-muted">
            We'll notify you of significant privacy policy changes via email or
            in-app notification.
          </p>
        </Section>

        {/* 12 */}
        <Section>
          <SectionTitle>12. Contact Us</SectionTitle>
          <p className="mb-4 text-sm text-brand-muted">
            Privacy questions? Email <PrivacyEmail />.
          </p>
          <div className="space-y-3">
            <div className="rounded-lg border border-brand-border bg-brand-bg px-5 py-4">
              <p className="text-sm text-brand-muted">
                <strong className="text-brand-text">Andrew Ibrahem</strong>
                {" "}&mdash; Developer, Coach Kettle
              </p>
              <p className="mt-1 text-sm text-brand-muted">
                General:{" "}
                <a href="mailto:andrew@coachkettle.app" className={mailLink}>
                  andrew@coachkettle.app
                </a>
                {" "}&middot;{" "}
                Privacy: <PrivacyEmail />
              </p>
            </div>
            <div className="rounded-lg border border-brand-border bg-brand-bg px-5 py-4">
              <p className="text-sm text-brand-muted">
                <strong className="text-brand-text">Gabriel Gaglio</strong>
                {" "}&mdash; Co-Developer, Coach Kettle
              </p>
              <p className="mt-1 text-sm text-brand-muted">
                <a href="mailto:gabe@coachkettle.com" className={mailLink}>
                  gabe@coachkettle.com
                </a>
              </p>
            </div>
          </div>
        </Section>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1 py-2 text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
          >
            &larr; Home
          </Link>
          <Link
            to="/terms"
            className="inline-flex items-center py-2 text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
          >
            Terms
          </Link>
          <Link
            to="/support"
            className="inline-flex items-center py-2 text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
          >
            Support
          </Link>
          <Link
            to="/eula"
            className="inline-flex items-center py-2 text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
          >
            EULA
          </Link>
        </div>
      </div>
    </>
  );
}
