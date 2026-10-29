import type { Metadata } from "next"
import HeroSection from "@/components/home/HeroSection"
import HealingPathSelector from "@/components/home/HealingPathSelector"
import SocialProofSection from "@/components/home/FeaturesSection"
import FreeAudioExperience from "@/components/home/FreeAudioExperience"
import ServicesPreview from "@/components/home/ServicesPreview"
import FeaturedHealers from "@/components/home/FeaturedHealers"
import ProgramsPreview from "@/components/home/ProgramsPreview"
import CommunityHighlights from "@/components/home/CommunityHighlights"
import BlogPreview from "@/components/home/BlogPreview"
import VIPMembershipSection from "@/components/home/VIPMembershipSection"
import CTASection from "@/components/home/CTASection"

// The homepage includes live database-backed sections; render them per request.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Ganges Healers — Holistic Wellness & Healing Marketplace",
  description:
    "Discover experienced healers offering yoga therapy, Reiki, sound healing, meditation coaching, hypnotherapy and more. Book sessions, enroll in programs, and shop wellness products.",
  openGraph: {
    title: "Ganges Healers — Holistic Wellness & Healing Marketplace",
    description:
      "Book healing sessions, enroll in wellness programs, and shop curated spiritual products.",
  },
}

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* 1. Hook — emotional headline + single primary CTA */}
      <HeroSection />
      {/* 2. Self-select — "What do you need healing for?" */}
      <HealingPathSelector />
      {/* 3. Trust — live platform stats */}
      <SocialProofSection />
      {/* 4. Low-friction engagement — free audio tracks */}
      <FreeAudioExperience />
      {/* 5. Core offering — popular services from DB */}
      <ServicesPreview />
      {/* 6. Authority — verified healer profiles */}
      <FeaturedHealers />
      {/* 7. Structured transformation — healing programs */}
      <ProgramsPreview />
      {/* 8. Social proof — community activity */}
      <CommunityHighlights />
      {/* 9. Content marketing — latest blog posts */}
      <BlogPreview />
      {/* 10. Monetisation — VIP membership pitch */}
      <VIPMembershipSection />
      {/* 11. Final CTA — diversified across all pillars */}
      <CTASection />
    </div>
  )
}
