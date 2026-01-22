import { NextRequest, NextResponse } from 'next/server';
import { User } from '@itrade/data-manager';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ users: [] });
  }

  try {
    const dataManager = await getDataManager();
    const userRepo = dataManager.dataSource.getRepository(User);

    // Search by email or ID (case-insensitive)
    const users = await userRepo
      .createQueryBuilder('user')
      .select(['user.id', 'user.email', 'user.name'])
      .where('LOWER(user.email) LIKE LOWER(:query)', { query: `%${query}%` })
      .orWhere('LOWER(user.id) LIKE LOWER(:query)', { query: `%${query}%` })
      .orWhere('LOWER(user.name) LIKE LOWER(:query)', { query: `%${query}%` })
      .orderBy('user.email', 'ASC')
      .take(10)
      .getMany();

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
      })),
    });
  } catch (error) {
    console.error('Error searching users:', error);
    return NextResponse.json(
      {
        error: 'Failed to search users',
        details:
          process.env.NODE_ENV === 'development' &&
          error &&
          typeof error === 'object' &&
          'message' in error
            ? String(error.message)
            : undefined,
      },
      { status: 500 },
    );
  }
}
