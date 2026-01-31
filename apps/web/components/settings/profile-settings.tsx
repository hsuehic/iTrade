'use client';

import { useState, useEffect, useMemo } from 'react';
import { Loader2, Check, User } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { useSession } from '@/components/session-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function ProfileSettings() {
  const t = useTranslations('settings.profile');
  const session = useSession();
  const user = session?.user;

  const [name, setName] = useState(user?.name || '');
  const [imageUrl, setImageUrl] = useState(user?.image || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Update local state when user changes
  useEffect(() => {
    if (user) {
      setName(user.name);
      setImageUrl(user.image || '');
    }
  }, [user]);

  // Debounced name validation using useMemo + setTimeout
  const validateName = useMemo(() => {
    let timeoutId: NodeJS.Timeout;
    return (value: string) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!value.trim()) {
          setNameError(t('errors.nameRequired'));
        } else if (value.trim().length < 2) {
          setNameError(t('errors.nameMin'));
        } else if (value.trim().length > 50) {
          setNameError(t('errors.nameMax'));
        } else {
          setNameError(null);
        }
      }, 500);
    };
  }, [t]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setName(value);
    setHasChanges(value !== user?.name || imageUrl !== (user?.image || ''));
    validateName(value);
  };

  const handleImageUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setImageUrl(value);
    setHasChanges(name !== user?.name || value !== (user?.image || ''));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Final validation
    if (!name.trim()) {
      setNameError(t('errors.nameRequired'));
      return;
    }

    if (nameError) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/settings/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          image: imageUrl || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('errors.updateFailed'));
      }

      toast.success(t('messages.updated'));
      setHasChanges(false);

      // Refresh the page to update session
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.updateFailed');
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar Preview */}
          <div className="flex items-center gap-4">
            <Avatar className="size-20">
              <AvatarImage src={imageUrl || undefined} alt={name} />
              <AvatarFallback className="text-lg">
                <User className="size-8" />
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t('pictureTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('pictureHint')}</p>
            </div>
          </div>

          {/* Image URL */}
          <div className="space-y-2">
            <Label htmlFor="imageUrl">{t('imageUrlLabel')}</Label>
            <Input
              id="imageUrl"
              type="url"
              placeholder={t('imageUrlPlaceholder')}
              value={imageUrl}
              onChange={handleImageUrlChange}
            />
            <p className="text-xs text-muted-foreground">{t('imageUrlHint')}</p>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              {t('displayNameLabel')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              type="text"
              placeholder={t('displayNamePlaceholder')}
              value={name}
              onChange={handleNameChange}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'name-error' : undefined}
              required
            />
            {nameError && (
              <p id="name-error" className="text-sm text-destructive" role="alert">
                {nameError}
              </p>
            )}
          </div>

          {/* Email (read-only) */}
          <div className="space-y-2">
            <Label htmlFor="email">{t('emailLabel')}</Label>
            <Input
              id="email"
              type="email"
              value={user.email}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">{t('emailHint')}</p>
          </div>

          {/* Submit Button */}
          <div className="flex items-center gap-4">
            <Button
              type="submit"
              disabled={isSubmitting || !hasChanges || !!nameError}
              className="min-w-32"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  {t('save')}
                </>
              )}
            </Button>
            {hasChanges && (
              <p className="text-sm text-muted-foreground">{t('unsaved')}</p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
