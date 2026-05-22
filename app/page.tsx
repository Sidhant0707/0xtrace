// app/page.tsx

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Navbar } from "@/components/landing/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { MarqueeBar } from "@/components/landing/MarqueeBar";
import { SocialProofBar } from "@/components/landing/SocialProofBar";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { CodeSection, BentoFeatures } from "@/components/landing/CodeSection";
import { CTABanner } from "@/components/landing/CTABanner";
import { Footer } from "@/components/landing/Footer";
import { BackgroundGrid } from "@/components/landing/BackgroundGrid";

export default async function RootPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen text-[#a1a1aa] antialiased">
      <Navbar />
      <HeroSection />
      <MarqueeBar />
      <SocialProofBar />
      <ProblemSection />
      <HowItWorks />
      <CodeSection />
      <BentoFeatures />
      <CTABanner />
      <Footer />
      <BackgroundGrid />
    </div>
  );
}
