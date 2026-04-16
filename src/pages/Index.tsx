import PublicLayout from "@/components/layout/PublicLayout";
import Hero from "@/components/home/Hero";
import Benefits from "@/components/home/Benefits";
import TopCategories from "@/components/home/TopCategories";
import QuickOrderTeaser from "@/components/home/QuickOrderTeaser";
import HowItWorks from "@/components/home/HowItWorks";

const Index = () => {
  return (
    <PublicLayout>
      <Hero />
      <Benefits />
      <TopCategories />
      <QuickOrderTeaser />
      <HowItWorks />
    </PublicLayout>
  );
};

export default Index;
