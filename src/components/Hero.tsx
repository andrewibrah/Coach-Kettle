import { Link } from "react-router-dom";
import {
  Activity,
  Award,
  Bike,
  Dumbbell,
  Flame,
  Footprints,
  Medal,
  PersonStanding,
  Swords,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import AppStoreBadge from "./AppStoreBadge";
import CoachLogo from "./CoachLogo";

/* Mobile-safe zone helper — on phones, only top 0-16% and bottom 0-16%
   are clear of the centered hero text. Items outside those zones are hidden
   on small screens to avoid overlapping the headline / description / CTA. */
function isMobileSafe(pos: { top?: string; bottom?: string }): boolean {
  const parse = (v?: string) => (v ? parseFloat(v) : NaN);
  const t = parse(pos.top);
  const b = parse(pos.bottom);
  if (!Number.isNaN(t) && t <= 16) return true;
  if (!Number.isNaN(b) && b <= 16) return true;
  return false;
}

function Sparkle({ top, left, delay, size = 4 }: { top: string; left: string; delay: string; size?: number }) {
  return (
    <svg
      className="animate-twinkle absolute"
      style={{ top, left, animationDelay: delay }}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="white"
    >
      <path d="M8 0L9.5 6.5L16 8L9.5 9.5L8 16L6.5 9.5L0 8L6.5 6.5Z" />
    </svg>
  );
}

/* Inline kettlebell — no Unicode emoji exists for one */
function KettlebellIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Handle */}
      <path
        d="M22 16 C22 9, 42 9, 42 16 L42 22 C42 22, 38 22, 38 19 C38 14, 26 14, 26 19 C26 22, 22 22, 22 22 Z"
        fill="currentColor"
      />
      {/* Bell body */}
      <path
        d="M16 38 C16 26, 48 26, 48 38 C48 50, 42 56, 32 56 C22 56, 16 50, 16 38 Z"
        fill="currentColor"
      />
      {/* Highlight */}
      <ellipse cx="26" cy="36" rx="3" ry="5" fill="rgba(255,255,255,0.25)" />
    </svg>
  );
}

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Full-width grid lines */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute left-[8%] top-0 h-full w-px bg-white/[0.06]" />
        <div className="absolute left-[20%] top-0 h-full w-px bg-white/[0.045]" />
        <div className="absolute left-[35%] top-0 h-full w-px bg-white/[0.05]" />
        <div className="absolute left-[50%] top-0 h-full w-px bg-white/[0.04]" />
        <div className="absolute left-[65%] top-0 h-full w-px bg-white/[0.05]" />
        <div className="absolute left-[80%] top-0 h-full w-px bg-white/[0.045]" />
        <div className="absolute left-[92%] top-0 h-full w-px bg-white/[0.06]" />
        <div className="absolute left-0 top-[15%] h-px w-full bg-white/[0.05]" />
        <div className="absolute left-0 top-[35%] h-px w-full bg-white/[0.06]" />
        <div className="absolute left-0 top-[55%] h-px w-full bg-white/[0.045]" />
        <div className="absolute left-0 top-[75%] h-px w-full bg-white/[0.05]" />
        <div className="absolute left-0 top-[90%] h-px w-full bg-white/[0.04]" />
      </div>

      {/* Glow orbs */}
      <div
        className="glow-orb"
        style={{ width: 600, height: 600, top: "-10%", right: "10%", background: "radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)" }}
      />
      <div
        className="glow-orb"
        style={{ width: 400, height: 400, bottom: "5%", left: "5%", background: "radial-gradient(circle, rgba(255,255,255,0.02) 0%, transparent 70%)" }}
      />

      {/* Main hero container */}
      <div className="relative mx-auto max-w-[1200px] overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Coach Kettle watermark */}
          <div className="absolute -right-20 top-1/2 -translate-y-1/2 opacity-[0.07]">
            <CoachLogo size={700} />
          </div>

          {/* Concentric rings — hidden on mobile, overlap centered hero text */}
          <div className="animate-pulse-ring absolute right-[15%] top-[18%] hidden h-48 w-48 rounded-full border border-white/[0.04] sm:block" />
          <div className="animate-pulse-ring absolute right-[17%] top-[20%] hidden h-36 w-36 rounded-full border border-white/[0.03] sm:block" style={{ animationDelay: "1s" }} />
          <div className="animate-pulse-ring absolute right-[19%] top-[22%] hidden h-24 w-24 rounded-full border border-white/[0.02] sm:block" style={{ animationDelay: "2s" }} />

          {/* Sparkles scattered around */}
          <Sparkle top="10%" left="12%" delay="0s" size={5} />
          <Sparkle top="25%" left="85%" delay="1.5s" size={4} />
          <Sparkle top="60%" left="8%" delay="3s" size={3} />
          <Sparkle top="70%" left="90%" delay="2s" size={5} />
          <Sparkle top="40%" left="92%" delay="4s" size={3} />
          <Sparkle top="85%" left="20%" delay="1s" size={4} />
          <Sparkle top="15%" left="70%" delay="2.5s" size={3} />
          <Sparkle top="50%" left="5%" delay="3.5s" size={4} />

          {/* Floating workout-term nodes */}
          {[
            { label: "BENCH 225×8", top: "12%", left: "6%", delay: "0s", size: "h-2 w-2" },
            { label: "SQUAT 315×5", top: "22%", right: "8%", delay: "1.5s", size: "h-1.5 w-1.5" },
            { label: "DEADLIFT 405×3", bottom: "28%", left: "5%", delay: "0.8s", size: "h-2 w-2" },
            { label: "PR!", top: "38%", right: "6%", delay: "3s", size: "h-2.5 w-2.5" },
            { label: "3×10 ROWS", top: "8%", left: "32%", delay: "2.2s", size: "h-1.5 w-1.5" },
            { label: "OHP 135×6", bottom: "15%", right: "22%", delay: "4s", size: "h-1.5 w-1.5" },
            { label: "5×5", top: "55%", left: "4%", delay: "1s", size: "h-2 w-2" },
            { label: "DROP SET", bottom: "35%", right: "4%", delay: "2.8s", size: "h-1.5 w-1.5" },
            { label: "SUPERSET", top: "15%", right: "30%", delay: "3.5s", size: "h-1.5 w-1.5" },
            { label: "AMRAP", bottom: "12%", left: "25%", delay: "0.5s", size: "h-1.5 w-1.5" },
            { label: "RPE 8", top: "68%", right: "10%", delay: "1.8s", size: "h-1.5 w-1.5" },
            { label: "CURLS 40×12", bottom: "45%", left: "8%", delay: "4.5s", size: "h-1.5 w-1.5" },
            { label: "RUN 20 MIN", top: "75%", left: "28%", delay: "2.5s", size: "h-1.5 w-1.5" },
            { label: "NEW PR", top: "45%", right: "28%", delay: "3.8s", size: "h-2 w-2" },
          ].map((node) => (
            <div
              key={node.label}
              className={`animate-float absolute flex items-center gap-2 ${isMobileSafe(node) ? "" : "max-sm:hidden"}`}
              style={{ top: node.top, bottom: node.bottom, left: node.left, right: node.right, animationDelay: node.delay }}
            >
              <div className={`${node.size} rounded-full bg-white/10`} />
              <span className="whitespace-nowrap text-[0.6rem] font-light tracking-wider text-white/[0.08]">
                {node.label}
              </span>
            </div>
          ))}

          {/* Floating gym icons (monochrome, lucide) */}
          {[
            { Icon: Dumbbell, top: "6%", left: "20%", delay: "0s", size: 30 },
            { Icon: Dumbbell, top: "9%", right: "14%", delay: "0.9s", size: 28 },
            { Icon: PersonStanding, top: "32%", left: "3%", delay: "1.4s", size: 26 },
            { Icon: Flame, bottom: "10%", left: "14%", delay: "2.1s", size: 26 },
            { Icon: Trophy, bottom: "22%", right: "16%", delay: "2.6s", size: 30 },
            { Icon: Medal, top: "52%", right: "3%", delay: "3.2s", size: 26 },
            { Icon: Activity, top: "64%", left: "18%", delay: "1.7s", size: 22 },
            { Icon: Footprints, bottom: "5%", right: "9%", delay: "4s", size: 26 },
            { Icon: Swords, top: "78%", left: "32%", delay: "3.5s", size: 22 },
            { Icon: Bike, top: "20%", left: "47%", delay: "5s", size: 24 },
            { Icon: Zap, top: "42%", left: "10%", delay: "2.3s", size: 22 },
            { Icon: Award, bottom: "40%", right: "6%", delay: "4.5s", size: 24 },
            { Icon: Target, top: "55%", left: "52%", delay: "3.8s", size: 22 },
          ].map(({ Icon, top, bottom, left, right, delay, size }, i) => (
            <div
              key={`gym-icon-${i}`}
              className={`animate-float-drift pointer-events-none absolute text-white/[0.16] ${isMobileSafe({ top, bottom }) ? "" : "max-sm:hidden"}`}
              style={{ top, bottom, left, right, animationDelay: delay }}
            >
              <Icon size={size} strokeWidth={1.5} />
            </div>
          ))}

          {/* Floating kettlebells (custom SVG — no Unicode kettlebell exists) */}
          {[
            { top: "18%", left: "58%", delay: "1s", size: 32, anim: "animate-float-slow" },
            { bottom: "32%", left: "42%", delay: "3.2s", size: 24, anim: "animate-float" },
            { top: "82%", right: "40%", delay: "2.1s", size: 28, anim: "animate-float-drift" },
            { top: "30%", left: "75%", delay: "4s", size: 22, anim: "animate-float-slow" },
            { bottom: "8%", left: "55%", delay: "0.6s", size: 26, anim: "animate-float" },
          ].map((kb, i) => (
            <div
              key={`kb-${i}`}
              className={`${kb.anim} pointer-events-none absolute text-white/[0.12] ${isMobileSafe({ top: kb.top, bottom: kb.bottom }) ? "" : "max-sm:hidden"}`}
              style={{
                top: kb.top,
                bottom: kb.bottom,
                left: kb.left,
                right: kb.right,
                animationDelay: kb.delay,
              }}
            >
              <KettlebellIcon size={kb.size} />
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="relative flex min-h-[85vh] flex-col items-center justify-center px-6 py-24 text-center sm:px-12 sm:py-32">
          {/* Subtitle pill */}
          <p className="animate-fade-up mb-8 text-[0.7rem] font-medium tracking-[0.25em] text-white/35" style={{ animationDelay: "0.1s" }}>
            YOUR AI WORKOUT COACH
          </p>

          {/* Main headline */}
          <h1 className="animate-fade-up mb-6 max-w-[800px] text-5xl font-bold leading-[1.05] tracking-[-0.02em] sm:text-6xl md:text-7xl lg:text-8xl" style={{ animationDelay: "0.25s" }}>
            Log workouts
            <br />
            in{" "}
            <span className="relative text-brand-muted" style={{ fontFamily: "'Caveat', cursive" }}>
              plain English.
              {/* Underline scribble */}
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none" preserveAspectRatio="none">
                <path d="M2 8c30-6 60-2 90-4s70 2 106-2" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </span>
          </h1>

          {/* Description */}
          <p className="animate-fade-up mb-12 max-w-[500px] text-[1rem] font-light leading-[1.8] text-brand-muted" style={{ animationDelay: "0.4s" }}>
            Type what you lifted. Coach Kettle parses it, tracks your PRs,
            celebrates milestones, and coaches you — no forms, no friction.
          </p>

          {/* CTA buttons */}
          <div
            className="animate-fade-up flex flex-col items-center gap-3 sm:flex-row sm:gap-4"
            style={{ animationDelay: "0.55s" }}
          >
            <AppStoreBadge />
            <Link
              to="/guide"
              className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/[0.04] px-7 py-4 text-center text-[0.88rem] font-semibold text-brand-text no-underline transition-all duration-300 hover:border-white/40 hover:bg-white/[0.08] active:scale-[0.97]"
            >
              Guide
            </Link>
          </div>

          {/* Bottom scroll indicator */}
          <div className="animate-fade-in absolute bottom-8 left-8 flex items-center gap-2 text-white/20" style={{ animationDelay: "1s" }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="animate-bounce-subtle"
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            <span className="text-[0.65rem] tracking-[0.1em]">SCROLL</span>
          </div>
        </div>
      </div>
    </section>
  );
}
