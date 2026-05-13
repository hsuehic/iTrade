import { NextResponse } from 'next/server';
import { getAllSettings } from '@/lib/settings';

/**
 * GET /api/config/chat
 *
 * Public endpoint — no auth required.
 * Returns the runtime-configurable chat widget settings so the frontend can
 * display them without a server restart.
 *
 * Response shape:
 *  {
 *    chat_title: string   // e.g. "Powered by Gemini 3.1 Flash Lite"
 *    gemini_model: string // e.g. "gemini-3.1-flash-lite"
 *  }
 */
export async function GET() {
  try {
    const settings = await getAllSettings();

    return NextResponse.json({
      chat_title: settings.chat_title || 'Powered by Gemini 3.1 Flash Lite',
      gemini_model: settings.gemini_model || 'gemini-3.1-flash-lite',
    });
  } catch (error) {
    console.error('[Chat Config API] GET error:', error);
    // Return safe defaults on error — the widget must always render
    return NextResponse.json({
      chat_title: 'Powered by Gemini 3.1 Flash Lite',
      gemini_model: 'gemini-3.1-flash-lite',
    });
  }
}
