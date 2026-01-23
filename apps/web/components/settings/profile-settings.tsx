'use client';

import { useState, useEffect, useMemo } from 'react';
import { Loader2, Check, User } from 'lucide-react';
import { toast } from 'sonner';

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
          setNameError('Name is required');
        } else if (value.trim().length < 2) {
          setNameError('Name must be at least 2 characters');
        } else if (value.trim().length > 50) {
          setNameError('Name must be less than 50 characters');
        } else {
          setNameError(null);
        }
      }, 500);
    };
  }, []);

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
      setNameError('Name is required');
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
        throw new Error(data.error || 'Failed to update profile');
      }

      toast.success('Profile updated successfully');
      setHasChanges(false);

      // Refresh the page to update session
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update profile';
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
        <CardTitle>Profile Information</CardTitle>
        <CardDescription>
          Update your personal information and profile picture.
        </CardDescription>
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
              <p className="text-sm font-medium">Profile Picture</p>
              <p className="text-xs text-muted-foreground">
                Enter a URL for your profile picture
              </p>
            </div>
          </div>

          {/* Image URL */}
          <div className="space-y-2">
            <Label htmlFor="imageUrl">Profile Image URL</Label>
            <Input
              id="imageUrl"
              type="url"
              placeholder="https://example.com/avatar.jpg"
              value={imageUrl}
              onChange={handleImageUrlChange}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use default avatar
            </p>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Display Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Your name"
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
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={user.email}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Email cannot be changed for security reasons
            </p>
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
                  Saving...
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  Save Changes
                </>
              )}
            </Button>
            {hasChanges && (
              <p className="text-sm text-muted-foreground">You have unsaved changes</p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
