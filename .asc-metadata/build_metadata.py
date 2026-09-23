#!/usr/bin/env python3
"""Build canonical asc metadata files for Coach Kettle 1.0.1 and check ASC length limits."""
import json, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))

SUBTITLE = "Workout & Nutrition AI Coach"

DESCRIPTION = """Coach Kettle is the fastest way to run your training. Type what you did — "Bench 185 x 8" — and move on. No menus, no dropdowns, no dead time between sets.

LOG LIFTS IN SECONDS
Type sets in plain language: "Bench 185 x 8", "Squat 225 3x8", or "185, 165, 145 x 8" for drop sets. Coach Kettle parses it instantly, and when a format is unfamiliar, AI handles it automatically. Single sets, multi-sets, drop sets, supersets, and cardio are all supported.

NUTRITION THAT KEEPS UP
Log food as fast as you log a set. Set calorie and macro targets, track them daily and weekly, and enter portions in the units you actually use — grams, ounces, pounds, cups, tablespoons, teaspoons, fluid ounces. Your day is scored at a glance so you always know where you stand.

A COACH THAT HOLDS YOU ACCOUNTABLE
Your daily coach reads what you actually logged and responds to it. Miss training days or blow past your macros and it gets more direct. String good days together and it eases off. Every line cites a specific hit or miss — no empty encouragement.

MULTI-WEEK PROGRAMMING
Build a training program that actually progresses. Coach Kettle seeds target weights from your PRs, adds intensity week over week, and schedules deloads so you don't stall. Between sets, get a suggested weight and rep target based on how the last one went.

TRACK THE WHOLE PICTURE
• Body weight, measurements, resting heart rate, and progress photos
• Strength analytics and estimated 1RM trends over time
• Automatic PR detection — every record gets confetti
• 1,300+ exercise library with instructions
• Rest timer, form check, custom templates, and full workout history

COACH KETTLE PRO
• Unlimited AI coach messages
• AI-generated meal plans
• Advanced strength analytics
• Unlimited custom templates

Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period. Manage or cancel anytime in your Apple ID account settings.

Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://coachkettle.com/#/privacy"""

WHATS_NEW = """This is a big one. Coach Kettle is no longer just a workout log.

NUTRITION
Log food and track calories and macros against daily and weekly targets, in the units you actually use.

DAILY COACH
Accountability that reads your real logs and adjusts how direct it gets based on how you're actually doing.

PROGRAMS
Multi-week training plans with automatic progression, scheduled deloads, and next-set weight and rep suggestions.

PROGRESS
Body weight, measurements, resting heart rate, and progress photos — all in one place.

EXERCISE LIBRARY
1,300+ exercises with instructions, searchable in seconds.

ALSO NEW
• Rest timer and form check
• Full accessibility pass — VoiceOver labels across the entire app
• More reliable syncing, plus fixes to PR celebrations and workout date handling

Thanks for lifting with us."""

# Name and subtitle are indexed by Apple, so terms already in
# "Coach Kettle" / "Workout & Nutrition AI Coach" are omitted here.
KEYWORDS = "gym,lifting,weightlifting,strength,macros,calorie,meal,diet,food,tracker,log,sets,reps,PR,program"

PROMO_TEXT = "Now with nutrition tracking, multi-week programs, and a daily coach that holds you accountable. Still the fastest way to log a set."

LIMITS = {
    "subtitle": 30,
    "description": 4000,
    "keywords": 100,
    "whatsNew": 4000,
    "promotionalText": 170,
}

app_info = {
    "name": "Coach Kettle",
    "subtitle": SUBTITLE,
    "privacyPolicyUrl": "https://coachkettle.com/#/privacy",
}

version = {
    "description": DESCRIPTION,
    "keywords": KEYWORDS,
    "marketingUrl": "https://coachkettle.com/#/",
    "promotionalText": PROMO_TEXT,
    "supportUrl": "https://coachkettle.com/#/support",
    "whatsNew": WHATS_NEW,
}

ok = True
for field, limit in LIMITS.items():
    val = app_info.get(field) or version.get(field)
    n = len(val)
    status = "OK " if n <= limit else "OVER"
    if n > limit:
        ok = False
    print(f"[{status}] {field:16} {n:5} / {limit}")

if not ok:
    sys.exit("Length limit exceeded; not writing files.")

with open(os.path.join(BASE, "app-info", "en-US.json"), "w") as f:
    json.dump(app_info, f, ensure_ascii=False)
with open(os.path.join(BASE, "version", "1.0.1", "en-US.json"), "w") as f:
    json.dump(version, f, ensure_ascii=False)

print("\nWrote app-info/en-US.json and version/1.0.1/en-US.json")
