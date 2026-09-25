/**
 * Legal Content
 *
 * Terms of Service and Privacy Policy content for Coach Kettle.
 * Written in plain English to be accessible to all users.
 */

export const TERMS_VERSION = '1.0.0';
export const LAST_UPDATED = 'September 24, 2026';

// Must equal CURRENT_PRIVACY_VERSION in supabase/functions/terms-acceptance/versions.ts
// (lib/__tests__/privacyRelease.test.ts checks it). Bumping it re-prompts every user once.
export const PRIVACY_VERSION = '1.1.0';
export const PRIVACY_LAST_UPDATED = 'September 24, 2026';

// Shown on the acceptance gate and inside the Privacy Policy. Every claim is
// checked against what the chat, coach, nutrition-analyze and meal-plan
// functions actually send (docs: g11 inventory §3).
export const CONSENT_AI_DISCLOSURE =
  'To power AI features, Coach Kettle sends the content needed for each request to OpenAI: your workout text and current session, your coach questions and recent chat, meal descriptions or meal photos you choose to analyze, and, for coaching and meal plans, relevant profile and training details (such as age and date of birth, sex, height, weight and goals, dietary preferences and allergies, recent workouts including any heart rate you log, personal records, nutrition targets and recent food logs). We do not send your name, email, or account ID to OpenAI.';

export const CONSENT_ACCEPT_TEXT =
  'By tapping Accept and Continue, you agree to the Terms of Service and Privacy Policy, including sending this data to OpenAI when you use AI features.';

export const TERMS_OF_SERVICE = `
# Coach Kettle Terms of Service

**Last Updated: ${LAST_UPDATED}**

Welcome to Coach Kettle. By creating an account, you agree to these terms.

## 1. What Coach Kettle Does

Coach Kettle helps you track your workouts using natural language. You type or speak your exercises, and we parse and organize them for you. We may use AI to help understand your input.

## 2. Your Account

**You are responsible for:**
- Keeping your login credentials secure
- All activity that occurs under your account
- Choosing a strong password (if using email/password login)
- Logging out on shared devices

**We provide:**
- Secure authentication via email/password, Apple Sign-In, or Google Sign-In

## 3. How Authentication Works

### Email & Password
Your password is hashed before storage. We never store or see your plain-text password.

### Apple & Google Sign-In
We use OAuth 2.0, the industry standard. We receive only your email and a unique identifier—never your Apple or Google password.

## 4. Your Data

### What we store:
- Your email address (for account identification)
- Your workout history (exercises, sets, reps, weights)
- Chat messages you send to the AI coach
- Basic usage analytics (app opens, feature usage)

### What we DON'T store:
- Your Apple or Google password
- Payment information (we don't process payments)

### Data deletion:
You can delete your account and its data at any time in the app: Settings → Delete account. The Privacy Policy lists what is removed. Deleting your account does not cancel an App Store subscription.

## 5. Acceptable Use

Don't use Coach Kettle to:
- Share your account with others
- Attempt to access other users' data
- Reverse engineer or exploit the app
- Upload harmful or illegal content

## 6. Disclaimers

### Not Medical Advice
Coach Kettle is a workout logging tool, not a medical or fitness professional. Always consult qualified professionals before starting any exercise program.

### Service Availability
We strive for 99% uptime but cannot guarantee uninterrupted service. We may perform maintenance that temporarily affects availability.

### Data Accuracy
While we work hard to accurately parse your workouts, mistakes can happen. Always verify important data.

## 7. Limitation of Liability

To the maximum extent permitted by law:
- We are not liable for any indirect, incidental, or consequential damages
- Our total liability is limited to the amount you paid us (if any)
- We are not responsible for workouts you perform based on data in the app

## 8. Changes to These Terms

We may update these terms. Significant changes will be communicated via email or in-app notification. Continued use after changes constitutes acceptance.

## 9. Contact

Questions? Reach us at support@coachkettle.app
`.trim();

export const PRIVACY_POLICY = `
# Coach Kettle Privacy Policy

**Version ${PRIVACY_VERSION} · Last Updated: ${PRIVACY_LAST_UPDATED}**

Your privacy matters. Here's exactly what data we collect, who we share it with, and why.

## Data We Collect

### Account Information
- Email address (to identify your account)
- Authentication provider (Apple, Google, or email)

### Workout Data
- Exercise names, sets, reps, and weights you log
- Cardio details you log, such as distance, calories, and heart rate
- Dates and times of workouts
- Any notes or reflections you add
- Personal records, templates, and programs

### Profile, Body, and Nutrition Data
- Profile details you enter: date of birth, sex, height, weight, goal weight, fitness focus, activity level, and equipment
- Body measurements, resting heart rate, and progress photos you add
- Food logs, nutrition targets, meal plans, dietary preferences, allergies, and disliked foods

### Photos and Media
- Photos and videos you attach to workouts, and progress photos, kept in private storage
- Meal photos you choose to analyze are sent to OpenAI for that request and are not stored

### AI Chat Data
- Messages you send to the AI coach
- AI responses (for conversation continuity)

### Technical Data
- Device type and operating system
- App version
- Server error logs
- Your IP address: our hosting and auth provider processes it to operate and secure the service, and we record it with your device's user agent when you accept these terms
- In-app feature usage events (kept by us, not shared with analytics companies)
- Your push notification token, if you turn on notifications

## Data We Don't Collect

- **Location data**: We don't track where you work out
- **Health app data**: We don't sync with Apple Health or Google Fit
- **Contacts**: We don't access your address book

## How We Use Your Data

1. **Provide the service**: Store and display your workouts
2. **Improve the app**: Understand usage patterns to make better features
3. **Customer support**: Help you if something goes wrong
4. **Security**: Detect and prevent abuse

## AI Features (OpenAI)

${CONSENT_AI_DISCLOSURE}

OpenAI processes this data to generate the response, under its API data usage policies.

## Data Storage & Security

- All data is encrypted in transit (HTTPS/TLS)
- Data is stored on Supabase infrastructure with encryption at rest
- Access to production data is restricted to essential personnel
- We regularly audit our security practices

## Third Parties

We use these service providers:
- **Supabase**: Database, authentication, file storage, and server functions (supabase.com)
- **OpenAI**: AI features, as described above (openai.com)
- **RevenueCat**: Subscription management. Receives your account ID, purchase history, and email address (revenuecat.com)
- **Apple**: App Store purchases and Sign in with Apple (apple.com)
- **Google**: Google Sign-In (google.com)
- **Expo**: Push notification delivery. Receives your push token and the notification text (expo.dev)
- **Open Food Facts**: Barcode lookups. Only the barcode is sent, with no personal data (openfoodfacts.org)

These providers have their own privacy policies and security practices.

## Your Rights

You can:
- **Access** your data at any time through the app
- **Export** your workout history (feature coming soon)
- **Delete** your account and data in the app: Settings → Delete account
- **Opt out** of optional features

## Deleting Your Account

Go to **Settings → Delete account** and confirm by signing in again. Deletion permanently removes:
- Your sign-in account
- Your app data: profile, workouts, nutrition, coach history, programs, and personal records
- Photos and videos you stored
- Your RevenueCat subscriber record

Deleting your account **does not cancel an App Store subscription**. Cancel it in your Apple ID subscription settings, or from Manage Subscription in the app, before you delete.

A record of past purchase events, with your account link and personal details removed, may be kept for accounting. Copies in encrypted backups expire on our database provider's backup schedule.

## Children's Privacy

Coach Kettle is not intended for children under 13. We don't knowingly collect data from children.

## California Privacy Rights (CCPA)

California residents have additional rights including:
- Right to know what data we collect
- Right to delete personal information
- Right to non-discrimination for exercising these rights

## International Users

Data may be processed in the United States. By using the app, you consent to this transfer.

## Changes

We'll notify you of significant privacy policy changes via email or in-app notification.

## Contact

Privacy questions? Email privacy@coachkettle.app
`.trim();
