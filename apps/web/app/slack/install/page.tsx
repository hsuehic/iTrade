import { Metadata } from 'next';

export const metadata: Metadata = { title: 'Slack Installation' };

export default async function SlackInstallPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const success = params.success === 'true';
  const error = params.error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="max-w-md w-full rounded-xl border p-8 text-center shadow-sm">
        {success ? (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-2xl font-bold mb-2">App installed successfully!</h1>
            <p className="text-muted-foreground mb-6">
              xiaowei&apos;s assistant has been added to your Slack workspace. You can now
              close this tab.
            </p>
          </>
        ) : (
          <>
            <div className="text-5xl mb-4">❌</div>
            <h1 className="text-2xl font-bold mb-2">Installation failed</h1>
            <p className="text-muted-foreground mb-6">
              {error === 'cancelled'
                ? 'You cancelled the installation.'
                : `Something went wrong: ${error || 'unknown error'}. Please try again.`}
            </p>
            <a
              href="/"
              className="inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Return to iTrade
            </a>
          </>
        )}
      </div>
    </div>
  );
}
