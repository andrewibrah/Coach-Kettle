import Hero from "../components/Hero";
import Features from "../components/Features";
import CTA from "../components/CTA";

export default function Home() {
  return (
    <>
      <Hero />
      <hr className="mx-auto max-w-[900px] border-t border-brand-border" />
      <Features />
      <hr className="mx-auto max-w-[900px] border-t border-brand-border" />
      <CTA />
    </>
  );
}
