'use client';

import { useState, useMemo } from 'react';
import { Loader2, Check, Eye, EyeOff, Shield } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function SecuritySettings() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation errors
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);

  // Debounced validation for new password using useMemo + setTimeout
  const validateNewPassword = useMemo(() => {
    let timeoutId: NodeJS.Timeout;
    return (value: string) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!value) {
          setNewPasswordError(null);
          return;
        }

        if (value.length < 8) {
          setNewPasswordError('Password must be at least 8 characters');
        } else if (!/[A-Z]/.test(value)) {
          setNewPasswordError('Password must contain at least one uppercase letter');
        } else if (!/[a-z]/.test(value)) {
          setNewPasswordError('Password must contain at least one lowercase letter');
        } else if (!/[0-9]/.test(value)) {
          setNewPasswordError('Password must contain at least one number');
        } else {
          setNewPasswordError(null);
        }
      }, 500);
    };
  }, []);

  // Debounced validation for confirm password using useMemo + setTimeout
  const validateConfirmPassword = useMemo(() => {
    let timeoutId: NodeJS.Timeout;
    return (value: string, newPwd: string) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!value) {
          setConfirmPasswordError(null);
          return;
        }

        if (value !== newPwd) {
          setConfirmPasswordError('Passwords do not match');
        } else {
          setConfirmPasswordError(null);
        }
      }, 500);
    };
  }, []);

  const handleCurrentPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentPassword(e.target.value);
    setCurrentPasswordError(null);
  };

  const handleNewPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewPassword(value);
    validateNewPassword(value);
    if (confirmPassword) {
      validateConfirmPassword(confirmPassword, value);
    }
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setConfirmPassword(value);
    validateConfirmPassword(value, newPassword);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validate all fields
    let hasErrors = false;

    if (!currentPassword) {
      setCurrentPasswordError('Current password is required');
      hasErrors = true;
    }

    if (!newPassword) {
      setNewPasswordError('New password is required');
      hasErrors = true;
    } else if (newPasswordError) {
      hasErrors = true;
    }

    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your new password');
      hasErrors = true;
    } else if (newPassword !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      hasErrors = true;
    }

    if (hasErrors) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/settings/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to change password');
      }

      toast.success('Password changed successfully');

      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to change password';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid =
    currentPassword &&
    newPassword &&
    confirmPassword &&
    !currentPasswordError &&
    !newPasswordError &&
    !confirmPasswordError &&
    newPassword === confirmPassword;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-5" />
          Change Password
        </CardTitle>
        <CardDescription>
          Update your password to keep your account secure. We recommend using a strong,
          unique password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Alert>
            <AlertDescription>
              <strong>Password requirements:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>At least 8 characters long</li>
                <li>Contains at least one uppercase letter (A-Z)</li>
                <li>Contains at least one lowercase letter (a-z)</li>
                <li>Contains at least one number (0-9)</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* Current Password */}
          <div className="space-y-2">
            <Label htmlFor="currentPassword">
              Current Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrentPassword ? 'text' : 'password'}
                placeholder="Enter your current password"
                value={currentPassword}
                onChange={handleCurrentPasswordChange}
                aria-invalid={!!currentPasswordError}
                aria-describedby={
                  currentPasswordError ? 'current-password-error' : undefined
                }
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
              >
                {showCurrentPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
            </div>
            {currentPasswordError && (
              <p
                id="current-password-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {currentPasswordError}
              </p>
            )}
          </div>

          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="newPassword">
              New Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? 'text' : 'password'}
                placeholder="Enter your new password"
                value={newPassword}
                onChange={handleNewPasswordChange}
                aria-invalid={!!newPasswordError}
                aria-describedby={newPasswordError ? 'new-password-error' : undefined}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowNewPassword(!showNewPassword)}
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
              >
                {showNewPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
            </div>
            {newPasswordError && (
              <p
                id="new-password-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {newPasswordError}
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">
              Confirm New Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm your new password"
                value={confirmPassword}
                onChange={handleConfirmPasswordChange}
                aria-invalid={!!confirmPasswordError}
                aria-describedby={
                  confirmPasswordError ? 'confirm-password-error' : undefined
                }
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
            </div>
            {confirmPasswordError && (
              <p
                id="confirm-password-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {confirmPasswordError}
              </p>
            )}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isSubmitting || !isFormValid}
            className="min-w-32"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Changing...
              </>
            ) : (
              <>
                <Check className="size-4" />
                Change Password
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
