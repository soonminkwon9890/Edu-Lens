import { HeroSection } from "@/components/home/hero-section";
import { FeaturesSection } from "@/components/home/features-section";
import { HowItWorksSection } from "@/components/home/how-it-works-section";
import { StatsSection } from "@/components/home/stats-section";
import { CtaSection } from "@/components/home/cta-section";

/**
 * Home page — Server Component.
 * Composes all marketing sections in order.
 */
export default function HomePage() {
  return (
    <>
      <HeroSection />
      <StatsSection />
      <FeaturesSection />
      <HowItWorksSection />
      <CtaSection />
    </>
  );
}
