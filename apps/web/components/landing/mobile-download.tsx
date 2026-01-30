'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { QrCode } from 'lucide-react';
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

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-3">
              {/* iOS Download */}
              <Link
                href="https://apps.apple.com/sg/app/itrade-ihsueh/id6753905284"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-block transition-all duration-300 ease-out hover:scale-110"
              >
                <Image
                  src="/app_store.png"
                  alt="Download on the App Store"
                  width={180}
                  height={54}
                  className="h-[54px] w-auto rounded-lg shadow-md transition-all duration-300 ease-out group-hover:shadow-2xl group-hover:shadow-primary/20"
                />
              </Link>

              {/* Google Play Download */}
              <Link
                href="https://play.google.com/store/apps/details?id=com.ihsueh.itrade"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-block transition-all duration-300 ease-out hover:scale-110"
              >
                <Image
                  src="/googleplay.svg"
                  alt="Get it on Google Play"
                  width={180}
                  height={54}
                  className="h-[54px] w-auto rounded-lg shadow-md transition-all duration-300 ease-out group-hover:shadow-2xl group-hover:shadow-primary/20"
                />
              </Link>

              {/* Direct APK Download */}
              <Link
                href="https://drive.google.com/file/d/15Tu1rmfbbSKJ-gdLvgjlsfXc3qRXMHk1/view?usp=sharing"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-block transition-all duration-300 ease-out hover:scale-110"
              >
                <Image
                  src="/android_apk.png"
                  alt="Download Android APK"
                  width={180}
                  height={54}
                  className="h-[54px] w-auto rounded-lg shadow-md transition-all duration-300 ease-out group-hover:shadow-2xl group-hover:shadow-primary/20"
                />
              </Link>
            </div>

            {/* QR Codes */}
            <div className="mt-8 rounded-xl border bg-background/50 p-6 backdrop-blur-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium">
                <QrCode className="size-4 text-primary" />
                <span>Scan to Download</span>
              </div>
              <div className="flex flex-wrap gap-6">
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-lg border bg-white p-2">
                    <Image
                      src="/qr-ios.png"
                      alt="App Store QR Code"
                      width={120}
                      height={120}
                      className="size-[120px]"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">App Store</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-lg border bg-white p-2">
                    <Image
                      src="/qr-android.png"
                      alt="Google Play QR Code"
                      width={120}
                      height={120}
                      className="size-[120px]"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">Google Play</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-lg border bg-white p-2">
                    <Image
                      src="/qr-apk.png"
                      alt="Direct APK Download QR Code"
                      width={120}
                      height={120}
                      className="size-[120px]"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">Direct APK</span>
                </div>
              </div>
            </div>

            {/* Features List */}
            <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
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
