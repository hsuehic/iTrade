'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { signUp } from '@/lib/auth-client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SignUpForm() {
  const t = useTranslations('auth.signUp');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  return (
    <div className="grid gap-4 p-6 md:p-8">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground text-balance">
          {t('subtitle')} <a href="/auth/sign-in">{t('signInLink')}</a>
          {t('subtitleEnd')}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="first-name">{t('firstNameLabel')}</Label>
          <Input
            id="first-name"
            placeholder={t('firstNamePlaceholder')}
            required
            onChange={(e) => {
              setFirstName(e.target.value);
            }}
            value={firstName}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="last-name">{t('lastNameLabel')}</Label>
          <Input
            id="last-name"
            placeholder={t('lastNamePlaceholder')}
            required
            onChange={(e) => {
              setLastName(e.target.value);
            }}
            value={lastName}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">{t('emailLabel')}</Label>
        <Input
          id="email"
          type="email"
          placeholder={t('emailPlaceholder')}
          required
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          value={email}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{t('passwordLabel')}</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder={t('passwordPlaceholder')}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{t('confirmPasswordLabel')}</Label>
        <Input
          id="password_confirmation"
          type="password"
          value={passwordConfirmation}
          onChange={(e) => setPasswordConfirmation(e.target.value)}
          autoComplete="new-password"
          placeholder={t('confirmPasswordPlaceholder')}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="image">{t('profileImageLabel')}</Label>
        <div className="flex items-end gap-4">
          {imagePreview && (
            <div className="relative w-16 h-16 rounded-sm overflow-hidden">
              <Image
                src={imagePreview}
                alt={t('profileImagePreviewAlt')}
                layout="fill"
                objectFit="cover"
              />
            </div>
          )}
          <div className="flex items-center gap-2 w-full">
            <Input
              id="image"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="w-full"
            />
            {imagePreview && (
              <X
                className="cursor-pointer"
                onClick={() => {
                  setImage(null);
                  setImagePreview(null);
                }}
              />
            )}
          </div>
        </div>
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={loading}
        onClick={async () => {
          await signUp.email({
            email,
            password,
            name: `${firstName} ${lastName}`,
            image: image ? await convertImageToBase64(image) : '',
            fetchOptions: {
              onResponse: () => {
                setLoading(false);
              },
              onRequest: () => {
                setLoading(true);
              },
              onError: (ctx) => {
                toast.error(ctx.error.message);
              },
              onSuccess: async () => {
                toast.success(t('messages.created'), {
                  description: t('messages.verifyEmail'),
                });
                router.push('/auth/sign-in');
              },
            },
          });
        }}
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : t('submit')}
      </Button>
    </div>
  );
}

async function convertImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
