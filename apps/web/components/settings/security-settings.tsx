'use client';

import { useState, useMemo } from 'react';
import { Loader2, Check, Eye, EyeOff, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('settings.security');
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
          setNewPasswordError(t('errors.minLength'));
        } else if (!/[A-Z]/.test(value)) {
          setNewPasswordError(t('errors.uppercase'));
        } else if (!/[a-z]/.test(value)) {
          setNewPasswordError(t('errors.lowercase'));
        } else if (!/[0-9]/.test(value)) {
          setNewPasswordError(t('errors.number'));
        } else {
          setNewPasswordError(null);
        }
      }, 500);
    };
  }, [t]);

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
          setConfirmPasswordError(t('errors.mismatch'));
        } else {
          setConfirmPasswordError(null);
        }
      }, 500);
    };
  }, [t]);

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
      setCurrentPasswordError(t('errors.currentRequired'));
      hasErrors = true;
    }

    if (!newPassword) {
      setNewPasswordError(t('errors.newRequired'));
      hasErrors = true;
    } else if (newPasswordError) {
      hasErrors = true;
    }

    if (!confirmPassword) {
      setConfirmPasswordError(t('errors.confirmRequired'));
      hasErrors = true;
    } else if (newPassword !== confirmPassword) {
      setConfirmPasswordError(t('errors.mismatch'));
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
        throw new Error(data.error || data.message || t('errors.updateFailed'));
      }

      toast.success(t('messages.updated'));

      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.updateFailed');
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
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Alert>
            <AlertDescription>
              <strong>{t('requirements.title')}</strong>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>{t('requirements.minLength')}</li>
                <li>{t('requirements.uppercase')}</li>
                <li>{t('requirements.lowercase')}</li>
                <li>{t('requirements.number')}</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* Current Password */}
          <div className="space-y-2">
            <Label htmlFor="currentPassword">
              {t('currentPassword')} <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrentPassword ? 'text' : 'password'}
                placeholder={t('currentPasswordPlaceholder')}
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
                aria-label={showCurrentPassword ? t('hidePassword') : t('showPassword')}
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
              {t('newPassword')} <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? 'text' : 'password'}
                placeholder={t('newPasswordPlaceholder')}
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
                aria-label={showNewPassword ? t('hidePassword') : t('showPassword')}
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
              {t('confirmPassword')} <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder={t('confirmPasswordPlaceholder')}
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
                aria-label={showConfirmPassword ? t('hidePassword') : t('showPassword')}
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
                {t('changing')}
              </>
            ) : (
              <>
                <Check className="size-4" />
                {t('submit')}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
