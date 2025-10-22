'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { Apple, Play } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface LandingHeaderProps {
  isAuthenticated: boolean;
}

export function LandingHeader({ isAuthenticated }: LandingHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-2">
          <Image
            src="/logo.svg"
            alt="iTrade Logo"
            width={32}
            height={32}
            className="size-8"
          />
          <span className="text-xl font-bold">iTrade</span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-2 sm:gap-4">
          {/* Mobile Download Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="hidden focus:ring-0 focus:ring-offset-0 sm:flex"
              >
                Mobile App
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="#mobile-download" className="flex items-center gap-2">
                  <Apple className="size-4" />
                  <span>iOS App</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="#mobile-download" className="flex items-center gap-2">
                  <Play className="size-4" />
                  <span>Android App</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ThemeSwitcher />

          {isAuthenticated ? (
            <Button asChild size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/auth/sign-in">Sign In</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:flex">
                <Link href="/auth/sign-up">Sign Up</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
