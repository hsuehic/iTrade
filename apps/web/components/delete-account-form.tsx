'use client';

import { useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type Step = 'email' | 'verify' | 'success';

export function DeleteAccountForm() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const handleSendCode = async () => {
    const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
    if (!email) {
      setError('Email is required');
      return;
    }
    if (!emailRegex.test(email)) {
      setError('Invalid email address format');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const response = await fetch('/api/auth/delete-account/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code');
      }

      toast.success('Verification code sent to your email');
      setStep('verify');
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!verificationCode) {
      setError('Verification code is required');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const response = await fetch('/api/auth/delete-account/verify', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verificationCode, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete account');
      }

      setStep('success');
      toast.success('Account deleted successfully');

      // Redirect to home page after 3 seconds
      setTimeout(() => {
        router.push('/');
      }, 3000);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-4 p-6 md:p-8 max-w-md mx-auto">
      <div className="flex flex-col items-center text-center mb-4">
        <AlertTriangle className="h-12 w-12 text-destructive mb-2" />
        <h1 className="text-2xl font-bold">Delete Account</h1>
        <p className="text-sm text-muted-foreground mt-2">
          This action cannot be undone. Your account and all associated data will be
          permanently deleted.
        </p>
      </div>

      {step === 'email' && (
        <>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              Please make sure you want to delete your account. All your data, including
              strategies, trades, and portfolios will be permanently removed.
            </AlertDescription>
          </Alert>

          <div className="grid gap-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              required
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              value={email}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              required
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              value={password}
            />
            <p className="text-xs text-muted-foreground">
              We need to verify your identity before sending the verification code
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              disabled={loading}
              onClick={handleSendCode}
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                'Send Verification Code'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => router.push('/')}
            >
              Cancel
            </Button>
          </div>
        </>
      )}

      {step === 'verify' && (
        <>
          <Alert>
            <AlertDescription>
              A verification code has been sent to <strong>{email}</strong>. Please check
              your inbox and enter the code below.
            </AlertDescription>
          </Alert>

          <div className="grid gap-2">
            <Label htmlFor="code">Verification Code</Label>
            <Input
              id="code"
              type="text"
              placeholder="Enter 6-digit code"
              required
              maxLength={6}
              onChange={(e) => {
                setVerificationCode(e.target.value);
                setError('');
              }}
              value={verificationCode}
            />
            <p className="text-xs text-muted-foreground">
              The code will expire in 10 minutes
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              disabled={loading}
              onClick={handleDeleteAccount}
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                'Confirm and Delete Account'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setStep('email')}
              disabled={loading}
            >
              Back
            </Button>
          </div>
        </>
      )}

      {step === 'success' && (
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
            <svg
              className="h-6 w-6 text-green-600 dark:text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Account Deleted</h2>
            <p className="mt-2 text-muted-foreground">
              Your account has been successfully deleted.
            </p>
          </div>

          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm">
              Thank you for being part of our community. We appreciate the time you spent
              with iTrade. We wish you all the best in your future trading endeavors.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Redirecting to home page in 3 seconds...
          </p>
        </div>
      )}
    </div>
  );
}
