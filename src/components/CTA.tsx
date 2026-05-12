import { useEffect, useRef } from "react";
import { Dumbbell, Flame, PersonStanding, Target } from "lucide-react";
import AppStoreBadge from "./AppStoreBadge";

export default function CTA() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("cta-visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative px-4 pb-16 pt-4 sm:px-8 lg:px-16">
      <div
        ref={ref}
        className="cta-section relative mx-auto max-w-[1200px] py-24 text-center sm:py-32"
      >
        {/* Glow */}
        <div
          className="glow-orb"
          style={{
            width: 400,
            height: 400,
            top: "10%",
            left: "50%",
            transform: "translateX(-50%)",
            background: "radial-gradient(circle, rgba(255,255,255,0.025) 0%, transparent 70%)",
          }}
        />

        {/* Slow-spinning gradient ring behind content */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[300px] animate-spin-slow rounded-full opacity-20 sm:h-[400px] sm:w-[400px]" style={{
          background: "conic-gradient(from 0deg, transparent, rgba(255,255,255,0.08), transparent, rgba(255,255,255,0.04), transparent)",
          transform: "translate(-50%, -50%)",
        }} />

        {/* Divider */}
        <div className="mx-auto mb-20 h-px max-w-[200px] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

        <div className="relative">
          <p className="cta-el mb-4 text-[0.75rem] font-light tracking-[0.25em] text-brand-muted">
            GET STARTED
          </p>
          <h2 className="cta-el mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Start lifting
            <br />
            <span className="text-brand-muted">smarter.</span>
          </h2>
          <p className="cta-el mx-auto mb-10 max-w-[440px] text-[0.95rem] font-light leading-[1.8] text-brand-muted">
            Download Coach Kettle, create your account, and log your first set
            in seconds.
          </p>
          <div className="cta-el">
            <AppStoreBadge />
          </div>
        </div>

        {/* Floating mini icons (monochrome, lucide) */}
        {[
          { Icon: Dumbbell, top: "15%", left: "10%", delay: "0s" },
          { Icon: PersonStanding, top: "20%", right: "12%", delay: "1s" },
          { Icon: Flame, bottom: "20%", left: "15%", delay: "2s" },
          { Icon: Target, bottom: "25%", right: "10%", delay: "3s" },
        ].map(({ Icon, top, bottom, left, right, delay }, i) => (
          <div
            key={`cta-icon-${i}`}
            className="animate-float-drift pointer-events-none absolute text-white/[0.14]"
            style={{ top, bottom, left, right, animationDelay: delay }}
          >
            <Icon size={22} strokeWidth={1.5} />
          </div>
        ))}
      </div>

      <style>{`
        .cta-section .cta-el {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .cta-section.cta-visible .cta-el:nth-child(1) { opacity: 1; transform: translateY(0); transition-delay: 0ms; }
        .cta-section.cta-visible .cta-el:nth-child(2) { opacity: 1; transform: translateY(0); transition-delay: 120ms; }
        .cta-section.cta-visible .cta-el:nth-child(3) { opacity: 1; transform: translateY(0); transition-delay: 240ms; }
        .cta-section.cta-visible .cta-el:nth-child(4) { opacity: 1; transform: translateY(0); transition-delay: 360ms; }
      `}</style>
    </section>
  );
}
