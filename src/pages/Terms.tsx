import { Link } from "react-router-dom";
import { useEffect } from "react";

// Mirrors the in-app Terms of Service in the app repo (constants/legal.ts,
// TERMS_OF_SERVICE / LAST_UPDATED). Keep the two in sync.
const TERMS_LAST_UPDATED = "September 24, 2026";

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
  return <h2 className="mb-4 text-base font-bold text-brand-text">{children}</h2>;
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-5 text-[0.95rem] font-bold text-brand-text">
      {children}
    </h3>
  );
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul role="list" className="mb-4 space-y-2 pl-5 text-sm text-brand-muted">
      {items.map((item, i) => (
        <li
          key={i}
          className="relative pl-4 before:absolute before:left-0 before:top-[0.55rem] before:h-[5px] before:w-[5px] before:rounded-full before:bg-brand-muted"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-sm text-brand-muted last:mb-0">{children}</p>;
}

export default function Terms() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <>
      <div className="border-b border-brand-border bg-brand-card px-6 py-10 text-center">
        <h1 className="text-2xl font-bold uppercase tracking-[0.08em] sm:text-3xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-brand-muted">
          Last updated {TERMS_LAST_UPDATED}
        </p>
      </div>

      <div className="mx-auto max-w-[780px] px-6 pb-16 pt-12">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-1 py-2 text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
        >
          &larr; Back to Home
        </Link>

        <Section>
          <P>Welcome to Coach Kettle. By creating an account, you agree to these terms.</P>
          <P>
            Coach Kettle is distributed through the App Store under Apple's{" "}
            <Link to="/eula" className={mailLink}>
              standard end user license agreement
            </Link>
            . How we handle your data is described in our{" "}
            <Link to="/privacy" className={mailLink}>
              Privacy Policy
            </Link>
            .
          </P>
        </Section>

        <Section>
          <SectionTitle>1. What Coach Kettle Does</SectionTitle>
          <P>
            Coach Kettle helps you track your workouts using natural language.
            You type or speak your exercises, and we parse and organize them for
            you. We may use AI to help understand your input.
          </P>
        </Section>

        <Section>
          <SectionTitle>2. Your Account</SectionTitle>
          <SubTitle>You are responsible for:</SubTitle>
          <BulletList
            items={[
              "Keeping your login credentials secure",
              "All activity that occurs under your account",
              "Choosing a strong password (if using email/password login)",
              "Logging out on shared devices",
            ]}
          />
          <SubTitle>We provide:</SubTitle>
          <BulletList
            items={["Secure authentication via email/password, Apple Sign-In, or Google Sign-In"]}
          />
        </Section>

        <Section>
          <SectionTitle>3. How Authentication Works</SectionTitle>
          <SubTitle>Email &amp; Password</SubTitle>
          <P>
            Your password is hashed before storage. We never store or see your
            plain-text password.
          </P>
          <SubTitle>Apple &amp; Google Sign-In</SubTitle>
          <P>
            We use OAuth 2.0, the industry standard. We receive only your email
            and a unique identifier&mdash;never your Apple or Google password.
          </P>
        </Section>

        <Section>
          <SectionTitle>4. Your Data</SectionTitle>
          <SubTitle>What we store:</SubTitle>
          <BulletList
            items={[
              "Your email address (for account identification)",
              "Your workout history (exercises, sets, reps, weights)",
              "Chat messages you send to the AI coach",
              "Basic usage analytics (app opens, feature usage)",
            ]}
          />
          <SubTitle>What we DON'T store:</SubTitle>
          <BulletList
            items={[
              "Your Apple or Google password",
              "Payment information (we don't process payments)",
            ]}
          />
          <SubTitle>Data deletion:</SubTitle>
          <P>
            You can delete your account and its data at any time in the app:
            Settings &rarr; Delete Account. The{" "}
            <Link to="/privacy" className={mailLink}>
              Privacy Policy
            </Link>{" "}
            lists what is removed. Deleting your account does not cancel an App
            Store subscription.
          </P>
        </Section>

        <Section>
          <SectionTitle>5. Acceptable Use</SectionTitle>
          <P>Don't use Coach Kettle to:</P>
          <BulletList
            items={[
              "Share your account with others",
              "Attempt to access other users' data",
              "Reverse engineer or exploit the app",
              "Upload harmful or illegal content",
            ]}
          />
        </Section>

        <Section>
          <SectionTitle>6. Disclaimers</SectionTitle>
          <SubTitle>Not Medical Advice</SubTitle>
          <P>
            Coach Kettle is a workout logging tool, not a medical or fitness
            professional. Always consult qualified professionals before starting
            any exercise program.
          </P>
          <SubTitle>Service Availability</SubTitle>
          <P>
            We strive for 99% uptime but cannot guarantee uninterrupted service.
            We may perform maintenance that temporarily affects availability.
          </P>
          <SubTitle>Data Accuracy</SubTitle>
          <P>
            While we work hard to accurately parse your workouts, mistakes can
            happen. Always verify important data.
          </P>
        </Section>

        <Section>
          <SectionTitle>7. Limitation of Liability</SectionTitle>
          <P>To the maximum extent permitted by law:</P>
          <BulletList
            items={[
              "We are not liable for any indirect, incidental, or consequential damages",
              "Our total liability is limited to the amount you paid us (if any)",
              "We are not responsible for workouts you perform based on data in the app",
            ]}
          />
        </Section>

        <Section>
          <SectionTitle>8. Changes to These Terms</SectionTitle>
          <P>
            We may update these terms. Significant changes will be communicated
            via email or in-app notification. Continued use after changes
            constitutes acceptance.
          </P>
        </Section>

        <Section>
          <SectionTitle>9. Contact</SectionTitle>
          <P>
            Questions? Reach us at{" "}
            <a href="mailto:support@coachkettle.app" className={mailLink}>
              support@coachkettle.app
            </a>
          </P>
        </Section>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1 py-2 text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
          >
            &larr; Home
          </Link>
          <Link
            to="/privacy"
            className="inline-flex items-center py-2 text-sm text-brand-muted no-underline transition-colors hover:text-brand-text"
          >
            Privacy
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
