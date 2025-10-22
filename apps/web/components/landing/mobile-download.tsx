'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Apple, Play, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function MobileDownload() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Set mounted state after first render to avoid hydration mismatch
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  const screenshot =
    mounted && resolvedTheme === 'dark' ? '/portfolio_dark.png' : '/portofolio.png';

  return (
    <section className="border-t bg-muted/30 py-16 sm:py-24" id="mobile-download">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Left Column - Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-background/50 px-4 py-2 text-sm backdrop-blur-sm">
              <QrCode className="size-4 text-primary" />
              <span>Trade on the Go</span>
            </div>

            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Download iTrade
              <br />
              <span className="text-primary">Mobile App</span>
            </h2>

            <p className="mb-8 text-lg text-muted-foreground">
              Take control of your crypto portfolio anywhere, anytime. Real-time market
              data, instant order execution, and advanced trading tools at your
              fingertips.
            </p>

            <div className="flex flex-col gap-4 sm:flex-row sm:gap-4">
              {/* iOS Download */}
              <Button
                asChild
                size="lg"
                variant="outline"
                className="group h-auto w-full justify-start gap-4 p-4 sm:w-auto"
              >
                <Link href="#" className="flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                    <Apple className="size-7" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs text-muted-foreground">Download on the</div>
                    <div className="text-base font-semibold">App Store</div>
                  </div>
                </Link>
              </Button>

              {/* Android Download */}
              <Button
                asChild
                size="lg"
                variant="outline"
                className="group h-auto w-full justify-start gap-4 p-4 sm:w-auto"
              >
                <Link href="#" className="flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                    <Play className="size-7" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs text-muted-foreground">Get it on</div>
                    <div className="text-base font-semibold">Google Play</div>
                  </div>
                </Link>
              </Button>
            </div>

            {/* Features List */}
            <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full bg-primary" />
                <span>Real-time Prices</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full bg-primary" />
                <span>Instant Notifications</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full bg-primary" />
                <span>Multi-Exchange</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full bg-primary" />
                <span>Secure Trading</span>
              </div>
            </div>
          </motion.div>

          {/* Right Column - Phone Mockup with Screenshot */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="relative flex justify-center lg:justify-end"
          >
            <div className="relative">
              {/* Decorative background */}
              <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 blur-3xl" />

              {/* Phone Frame with Real Screenshot */}
              <div className="relative h-[500px] w-[250px] sm:h-[600px] sm:w-[300px]">
                {/* Phone Frame Border */}
                <div className="absolute inset-0 rounded-[2.5rem] border-[8px] border-gray-800 bg-gray-800 shadow-2xl dark:border-gray-700">
                  {/* Notch */}
                  <div className="absolute left-1/2 top-0 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-gray-800 dark:bg-gray-700" />

                  {/* Screen with Screenshot */}
                  <div className="relative h-full w-full overflow-hidden rounded-[1.8rem] bg-white dark:bg-gray-900">
                    {mounted ? (
                      <Image
                        src={screenshot}
                        alt="iTrade Mobile App Portfolio Screenshot"
                        fill
                        className="object-cover object-top"
                        priority
                      />
                    ) : (
                      <div className="size-full animate-pulse bg-muted" />
                    )}
                  </div>
                </div>

                {/* Home Button */}
                <div className="absolute bottom-2 left-1/2 h-1 w-20 -translate-x-1/2 rounded-full bg-gray-600" />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
