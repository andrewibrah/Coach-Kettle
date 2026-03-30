# App Store Connect App Privacy Declaration Guide — Coach Kettle

**Bundle ID:** com.coachkettle.coachkettle
**App Name:** Coach Kettle

This guide walks you through every screen in App Store Connect's App Privacy section so you can complete the declaration accurately before submitting for review.

---

## 1. Navigate to App Privacy in App Store Connect

1. Sign in to [App Store Connect](https://appstoreconnect.apple.com).
2. Select **My Apps** → **Coach Kettle**.
3. In the left sidebar, under your app version, click **App Privacy**.
4. Click **Get Started** (or **Edit** if you have previously started).

---

## 2. Support URL and Privacy Policy URL

Before filling in privacy data you must provide a support URL and a privacy policy URL. These are required fields on your App Store listing.

### Enable GitHub Pages

1. Go to your repository: `https://github.com/aibrah/Coach-Kettle`
2. Click **Settings** → **Pages** (left sidebar).
3. Under **Source**, select **Deploy from a branch**.
4. Choose the `main` branch and `/docs` folder. Click **Save**.
5. In **Custom domain**, enter `coachkettle.com` and save.
6. GitHub will publish your site at `https://coachkettle.com/` once DNS is configured and the Pages build completes.

### Required URLs

| Field | URL |
|---|---|
| Support URL | `https://coachkettle.com/support` |
| Privacy Policy URL | `https://coachkettle.com/privacy` |

Keep `docs/CNAME` set to `coachkettle.com` so GitHub Pages continues to use the custom domain. The privacy policy must be live and reachable by the time you submit for review.

**Where to enter these in App Store Connect:**
- Go to **App Information** (left sidebar under your app, not the version).
- Paste the Support URL and Privacy Policy URL in the corresponding fields.

---

## 3. App Category Recommendation

In **App Store Connect → App Information → Category**:

| Field | Value |
|---|---|
| **Primary Category** | Health & Fitness |
| **Secondary Category** | Productivity |

---

## 4. Content Rights Information

In App Store Connect, after completing your app information, you may be asked:

> **Does your app contain, display, or access third-party content?**

**Answer: No**

Coach Kettle does not display, stream, or reproduce third-party copyrighted content. All workout logs, coaching messages, and media are created and owned by the user themselves. The OpenAI API is used only to process and generate text responses — no third-party copyrighted content is presented to users.

---

## 5. Data Types — Complete Declaration Table

Use this table as your reference when Apple's questionnaire asks which data types you collect.

| Apple Category | Apple Data Type | Collected? | Purpose(s) | Linked to Identity | Used for Tracking |
|---|---|---|---|---|---|
| Contact Info | Email Address | **YES** | Account Management, App Functionality | YES | NO |
| Health & Fitness | Fitness | **YES** | App Functionality, Product Personalization | YES | NO |
| Photos or Videos | Photos or Videos | **YES** | App Functionality | YES | NO |
| User Content | Other User Content | **YES** | App Functionality | YES | NO |
| Identifiers | User ID | **YES** | App Functionality | YES | NO |
| Usage Data | Product Interaction | **YES** | Analytics, App Improvement | NO | NO |
| Location | — | **NO** | — | — | — |
| Financial Info | — | **NO** | — | — | — |
| Sensitive Info | — | **NO** | — | — | — |
| Contacts | — | **NO** | — | — | — |
| Browsing History | — | **NO** | — | — | — |
| Search History | — | **NO** | — | — | — |
| Diagnostics / Crash Data | — | **NO** | — | — | — |

---

## 6. How to Fill Each Questionnaire Screen

Apple's privacy questionnaire walks through categories one by one. Follow these answers for each screen.

---

### Screen 1 — Do you collect data from this app?

**Answer: Yes**

---

### Screen 2 — Select all data types your app collects or uses

Check the following boxes:

- [x] **Contact Info**
- [x] **Health & Fitness**
- [x] **Photos or Videos**
- [x] **User Content**
- [x] **Identifiers**
- [x] **Usage Data**

Leave everything else unchecked (Location, Financial Info, Sensitive Info, Contacts, Browsing History, Search History, Diagnostics).

---

### Screen 3 — Contact Info → Email Address

Apple will ask about **Email Address** within the Contact Info category.

**Is this data collected?** Yes

**Why do you collect email address?**
Check:
- [x] App Functionality
- [x] Account Management

**Is email address linked to the user's identity?** Yes — select **Linked to the User's Identity**

**Is email address used to track users?** No — select **No, we do not use it to track users**

> Note: Email is obtained only via Apple Sign In. Coach Kettle receives only the email address, not the user's full name or other Apple ID data. It is used solely to identify the account in Supabase Auth.

---

### Screen 4 — Health & Fitness → Fitness

Apple will ask about **Fitness** within the Health & Fitness category.

**Is this data collected?** Yes

**Why do you collect fitness data?**
Check:
- [x] App Functionality
- [x] Product Personalization

**Is fitness data linked to the user's identity?** Yes — select **Linked to the User's Identity**

**Is fitness data used to track users?** No — select **No, we do not use it to track users**

> Note: Fitness data includes exercise names, set/rep/weight logs, body parts, and workout session records. This is the core data of the app. It is stored in Supabase Postgres, linked to the user's UUID, and never sold or shared with third parties. Workout text is sent to OpenAI for AI parsing/coaching but contains no personal identifiers.

---

### Screen 5 — Photos or Videos → Photos or Videos

**Is this data collected?** Yes

**Why do you collect photos or videos?**
Check:
- [x] App Functionality

**Is this data linked to the user's identity?** Yes — select **Linked to the User's Identity**

**Is this data used to track users?** No — select **No, we do not use it to track users**

> Note: Media is optional and user-initiated. Users may attach gym photos or videos to workout sessions. Files are stored in Supabase Storage and are not processed, analyzed, or shared beyond the user's own account.

---

### Screen 6 — User Content → Other User Content

**Is this data collected?** Yes

**Why do you collect other user content?**
Check:
- [x] App Functionality

**Is this data linked to the user's identity?** Yes — select **Linked to the User's Identity**

**Is this data used to track users?** No — select **No, we do not use it to track users**

> Note: This covers AI coaching conversation messages and workout session notes/reflections entered by the user. These are stored in Supabase and may be sent to OpenAI for processing, but only the message text is transmitted — no name, email, or device identifier is included in OpenAI API requests.

---

### Screen 7 — Identifiers → User ID

**Is this data collected?** Yes

**Why do you collect user ID?**
Check:
- [x] App Functionality

**Is this data linked to the user's identity?** Yes — select **Linked to the User's Identity**

**Is this data used to track users?** No — select **No, we do not use it to track users**

> Note: The user ID is the Supabase-generated UUID assigned at account creation. It is used internally to associate all workout data, sessions, and media with the correct account. It is not shared externally.

---

### Screen 8 — Usage Data → Product Interaction

**Is this data collected?** Yes

**Why do you collect product interaction data?**
Check:
- [x] Analytics
- [x] App Improvement (if shown; this may appear as "Developer's Advertising or Marketing" — do NOT check that one)

**Is this data linked to the user's identity?** No — select **Not Linked to the User's Identity**

**Is this data used to track users?** No — select **No, we do not use it to track users**

> Note: App usage signals (feature interactions, session counts) are collected anonymously for improving the product. No crash reporting SDK (e.g., Sentry, Crashlytics) is integrated, so do not declare Crash Data.

---

### Screen 9 — Review and Publish

Apple shows a summary of your selections. Verify it matches the table in Section 5 above, then click **Publish**.

> Important: Once published, your privacy nutrition label is visible on the App Store immediately. Update it any time your data practices change before submitting an app update.

---

## 7. Pre-Submission Checklist

Complete all six items before clicking **Add for Review**:

- [ ] **App Privacy declaration published** in App Store Connect with all six data types declared correctly (Contact Info, Health & Fitness, Photos or Videos, User Content, Identifiers, Usage Data).
- [ ] **Privacy Policy URL** is live and reachable at `https://coachkettle.com/privacy`.
- [ ] **Support URL** is live and reachable at `https://coachkettle.com/support`.
- [ ] **Primary Category** set to **Health & Fitness** and **Secondary Category** set to **Productivity** in App Information.
- [ ] **Content Rights** question answered **No** (no third-party copyrighted content).
- [ ] **App version, build, and metadata** are complete (screenshots for required device sizes, description, keywords, what's new text).

---

## 8. Additional Notes

### OpenAI API and Third-Party Data Sharing

Apple's questionnaire may ask whether data is shared with third parties. When answering:

- Workout text and coaching messages are sent to OpenAI's API for processing.
- However, these transmissions contain **no personal identifiers** (no email, no name, no device ID, no user UUID).
- Because the data sent to OpenAI cannot be used to identify the user, it does not meet Apple's definition of sharing linked data with a third party.
- You should still review [Apple's guidelines on third-party data sharing](https://developer.apple.com/app-store/app-privacy-details/) to confirm this interpretation remains accurate at submission time.

### Apple Sign In

Because Coach Kettle uses **Sign in with Apple** as its sole authentication method, you are already compliant with Apple's requirement that apps offering social login must include Apple Sign In.

### Future Data Types to Watch

If you add any of the following features later, update your privacy declaration before the next app submission:

- Crash/error reporting (Sentry, Crashlytics) → adds **Crash Data** under Diagnostics
- In-app purchases or subscriptions → adds **Purchase History** under Financial Info
- Push notifications with personalization → revisit Identifiers/Device ID declaration
- Heart rate, VO2 max, or HealthKit integration → adds **Health** under Health & Fitness (distinct from Fitness)
