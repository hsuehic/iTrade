import { auth } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      marketingEmails,
      tradingAlerts,
      priceAlerts,
      orderUpdates,
      accountActivity,
      weeklyReports,
      productUpdates,
      newsAndTips,
    } = body;

    // Get the data manager and email preferences repository
    const dataManager = await getDataManager();
    const emailPrefsRepo = dataManager.getEmailPreferencesRepository();

    // Update preferences in database
    await emailPrefsRepo.update(session.user.id, {
      marketingEmails,
      tradingAlerts,
      priceAlerts,
      orderUpdates,
      accountActivity,
      weeklyReports,
      productUpdates,
      newsAndTips,
    });

    return Response.json({
      success: true,
      message: 'Email preferences saved successfully',
    });
  } catch (error) {
    console.error('Error saving email preferences:', error);
    return Response.json({
      success: false,
      message: (error as { message: string }).message,
    });
  }
}

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Get the data manager and email preferences repository
    const dataManager = await getDataManager();
    const emailPrefsRepo = dataManager.getEmailPreferencesRepository();

    // Get preferences from database (creates default if doesn't exist)
    const preferences = await emailPrefsRepo.getByUserId(session.user.id);

    return Response.json({
      success: true,
      preferences: {
        marketingEmails: preferences.marketingEmails,
        tradingAlerts: preferences.tradingAlerts,
        priceAlerts: preferences.priceAlerts,
        orderUpdates: preferences.orderUpdates,
        accountActivity: preferences.accountActivity,
        weeklyReports: preferences.weeklyReports,
        productUpdates: preferences.productUpdates,
        newsAndTips: preferences.newsAndTips,
      },
    });
  } catch (error) {
    console.error('Error fetching email preferences:', error);
    return Response.json({
      success: false,
      message: (error as { message: string }).message,
    });
  }
}
