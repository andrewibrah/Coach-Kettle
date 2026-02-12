/**
 * Legal Content
 *
 * Terms of Service and Privacy Policy content for Coach Kettle.
 * Written in plain English to be accessible to all users.
 */

export const TERMS_VERSION = '1.0.0';
export const LAST_UPDATED = 'January 2026';

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
- Automatic session expiration after 4 hours of inactivity

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
You can request deletion of your account and all associated data at any time by contacting us.

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

**Last Updated: ${LAST_UPDATED}**

Your privacy matters. Here's exactly what data we collect and why.

## Data We Collect

### Account Information
- Email address (to identify your account)
- Authentication provider (Apple, Google, or email)

### Workout Data
- Exercise names, sets, reps, and weights you log
- Dates and times of workouts
- Any notes you add

### AI Chat Data
- Messages you send to the AI coach
- AI responses (for conversation continuity)

### Technical Data
- Device type and operating system
- App version
- Crash reports and error logs

## Data We Don't Collect

- **Location data**: We don't track where you work out
- **Health app data**: We don't sync with Apple Health or Google Fit
- **Contacts**: We don't access your address book

## How We Use Your Data

1. **Provide the service**: Store and display your workouts
2. **Improve the app**: Understand usage patterns to make better features
3. **Customer support**: Help you if something goes wrong
4. **Security**: Detect and prevent abuse

## Data Storage & Security

- All data is encrypted in transit (HTTPS/TLS)
- Data is stored on Supabase infrastructure with encryption at rest
- Access to production data is restricted to essential personnel
- We regularly audit our security practices

## Third Parties

We use these service providers:
- **Supabase**: Database and authentication (supabase.com)
- **OpenAI**: AI-powered workout parsing (openai.com)

These providers have their own privacy policies and security practices.

## Your Rights

You can:
- **Access** your data at any time through the app
- **Export** your workout history (feature coming soon)
- **Delete** your account and all data by contacting us
- **Opt out** of optional features

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

export const CONSENT_CHECKBOX_TEXT =
  'I have read and agree to the Terms of Service and Privacy Policy';

export const CONSENT_EXPLANATION = `
By creating an account, you acknowledge that:

• Your workout data will be stored securely in the cloud
• We may use AI services to help parse your workout input
• You can delete your account and data at any time
`.trim();

