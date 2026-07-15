import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Clock3, MapPin, PackageCheck, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import heroImage from "@/assets/hero-candles.jpg";

const facts = ["Заказ от 1 коробки", "Оптовая цена сразу", "Остатки онлайн"];
const terms = [
  { icon: PackageCheck, value: "1 коробка", label: "минимальный заказ" },
  { icon: Percent, value: "до 15%", label: "скидка от объёма" },
  { icon: Clock3, value: "1–2 дня", label: "срок отгрузки" },
];

const notifyHeroReady = () => {
  (window as Window & { __candwaxHeroReady?: boolean }).__candwaxHeroReady = true;
  window.dispatchEvent(new Event("candwax:home-hero-ready"));
};

const Hero = () => {
  const reduceMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  const constrainedConnection =
    connection?.saveData === true ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g";
  const showVideo = !reduceMotion && !isMobile && !constrainedConnection && !videoFailed;

  useEffect(() => {
    if (!showVideo) notifyHeroReady();
  }, [showVideo]);

  useEffect(() => {
    if (!showVideo) return;

    const resumeVideo = () => {
      const video = videoRef.current;
      if (!video || document.visibilityState !== "visible" || !video.paused) return;
      void video.play().catch(() => {
        // Autoplay may be temporarily blocked by the browser. Keep the video
        // mounted so it can resume on the next focus/visibility event.
      });
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) resumeVideo();
      },
      { threshold: 0.15 },
    );
    const video = videoRef.current;
    if (video) observer.observe(video);
    document.addEventListener("visibilitychange", resumeVideo);
    window.addEventListener("focus", resumeVideo);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", resumeVideo);
      window.removeEventListener("focus", resumeVideo);
    };
  }, [showVideo]);
  const enter = (delay = 0) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const },
  });

  return (
    <section className="relative isolate min-h-[760px] overflow-hidden bg-foreground text-white lg:min-h-[calc(100dvh-108px)]">
      <div className="absolute inset-0 z-0 overflow-hidden">
        {!showVideo ? (
          <img src={heroImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            className="h-[calc(100%+36px)] w-full object-cover object-top"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={heroImage}
            aria-hidden="true"
            onCanPlay={notifyHeroReady}
            onError={() => {
              setVideoFailed(true);
              notifyHeroReady();
            }}
          >
            <source src="/media/hero-candle-shop-a5e9bfc1.mp4" type="video/mp4" />
          </video>
        )}
      </div>
      <div aria-hidden className="absolute inset-0 z-[1] bg-gradient-to-r from-black/90 via-black/60 to-black/20" />
      <div aria-hidden className="absolute inset-0 z-[2] bg-gradient-to-t from-black/70 via-transparent to-black/10" />

      <div className="container relative z-10 grid min-h-[760px] items-end gap-10 pb-12 pt-20 lg:min-h-[calc(100dvh-108px)] lg:grid-cols-[minmax(0,1fr)_340px] lg:pb-14 lg:pt-24">
        <div className="max-w-4xl">
          <motion.div {...enter()} className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-white/90 backdrop-blur-sm">
            <PackageCheck className="h-4 w-4 text-primary" /> Оптовая витрина для вашего магазина
          </motion.div>

          <motion.h1 {...enter(0.06)} className="hero-title mt-7 max-w-4xl font-display tracking-[-0.05em] text-white">
            Свечи, которые <span className="italic text-[#efa06d]">хочется</span> поставить на полку
          </motion.h1>

          <motion.p {...enter(0.12)} className="mt-7 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
            Соберите ассортимент для магазина, студии или кофейни без закупки «на склад». Начните с одной коробки — наличие и оптовая выгода видны сразу.
          </motion.p>

          <motion.div {...enter(0.18)} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="group h-14 min-w-[220px] px-8 text-base shadow-xl shadow-black/20 sm:h-16 sm:min-w-[250px] sm:text-lg">
              <Link to="/catalog">Смотреть каталог <ArrowRight className="transition-transform group-hover:translate-x-1" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-14 min-w-[220px] border-white/55 bg-white/95 px-8 text-base text-[#241b16] hover:bg-white [&_svg]:text-[#241b16] sm:h-16 sm:min-w-[250px] sm:text-lg">
              <Link to="/wholesale-terms">Условия для бизнеса</Link>
            </Button>
          </motion.div>

          <motion.ul {...enter(0.24)} className="mt-8 flex flex-col gap-3 text-sm text-white/75 sm:flex-row sm:gap-7">
            {facts.map((fact) => (
              <li key={fact} className="flex items-center gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15 text-[#efa06d]"><Check className="h-3 w-3" strokeWidth={3} /></span>
                {fact}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.aside {...enter(0.2)} className="rounded-3xl border border-white/20 bg-black/30 p-5 shadow-2xl backdrop-blur-md lg:mb-1">
          <div className="flex items-center gap-2 border-b border-white/15 pb-4 text-sm font-semibold"><MapPin className="h-4 w-4 text-[#efa06d]" />Склад и отгрузка в Москве</div>
          <dl className="mt-2 divide-y divide-white/12">
            {terms.map(({ icon: Icon, value, label }) => (
              <div key={label} className="flex items-center gap-3 py-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-[#efa06d]"><Icon className="h-4 w-4" /></span>
                <div><dt className="text-lg font-semibold text-white">{value}</dt><dd className="text-xs text-white/55">{label}</dd></div>
              </div>
            ))}
          </dl>
        </motion.aside>
      </div>
    </section>
  );
};

export default Hero;
