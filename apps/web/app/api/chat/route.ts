/**
 * POST /api/chat
 *
 * Main chatbot API route. Handles multi-turn conversations with Gemini 2.5 Flash,
 * using function calling to fetch real trading data from iTrade APIs.
 */
import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { createChatModel } from '@/lib/chatbot/gemini';
import { CHATBOT_TOOLS, executeToolCall, type ToolName } from '@/lib/chatbot/tools';
import type { Content } from '@google/generative-ai';

export const maxDuration = 30; // Allow up to 30s for multi-tool calls

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const session = await getSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { message, history = [] } = body as {
      message: string;
      history: Array<{ role: 'user' | 'model'; content: string }>;
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Build the base URL for internal API calls
    const requestUrl = new URL(request.url);
    const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

    // Pass session cookie for authenticated API calls
    const cookie = request.headers.get('cookie') || '';

    // Create Gemini model with tools
    const model = createChatModel(CHATBOT_TOOLS);

    // Convert chat history to Gemini Content format
    const geminiHistory: Content[] = history.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.content }],
    }));

    // Start chat session
    const chat = model.startChat({ history: geminiHistory });

    // Send user message
    let response = await chat.sendMessage(message);
    let candidate = response.response;

    // Agentic loop: keep executing tool calls until Gemini stops asking for them
    const MAX_TOOL_ROUNDS = 5;
    let toolRound = 0;

    while (toolRound < MAX_TOOL_ROUNDS) {
      const functionCalls = candidate.functionCalls();
      if (!functionCalls || functionCalls.length === 0) break;

      toolRound++;

      // Execute all requested tool calls in parallel
      const toolResults = await Promise.allSettled(
        functionCalls.map(async (fc) => {
          try {
            const result = await executeToolCall(
              fc.name as ToolName,
              (fc.args as Record<string, unknown>) || {},
              baseUrl,
              cookie,
            );
            return {
              functionResponse: {
                name: fc.name,
                response: { result },
              },
            };
          } catch (err) {
            return {
              functionResponse: {
                name: fc.name,
                response: {
                  error: err instanceof Error ? err.message : 'Tool execution failed',
                },
              },
            };
          }
        }),
      );

      // Feed tool results back to Gemini
      const toolResponseParts = toolResults.map((r) =>
        r.status === 'fulfilled'
          ? r.value
          : {
              functionResponse: {
                name: 'unknown',
                response: { error: 'Tool call failed' },
              },
            },
      );

      response = await chat.sendMessage(toolResponseParts);
      candidate = response.response;
    }

    // Extract the final text response
    const rawText = candidate.text();

    // Parse structured render hints from the response (```json ... ```)
    let renderData: {
      renderAs?: 'table' | 'chart' | 'text';
      title?: string;
      data?: unknown;
      chartConfig?: unknown;
    } | null = null;
    let cleanText = rawText;

    const jsonBlockMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      try {
        renderData = JSON.parse(jsonBlockMatch[1]);
        // Remove the json block from the displayed text
        cleanText = rawText.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
      } catch {
        // If parsing fails, just use the raw text
      }
    }

    return NextResponse.json({
      message: cleanText,
      renderData,
    });
  } catch (error) {
    console.error('[Chat API] Error:', error);

    if (error instanceof Error && error.message.includes('GEMINI_API_KEY')) {
      return NextResponse.json(
        {
          error:
            'AI service not configured. Please add GEMINI_API_KEY to your environment. Get a free key at https://aistudio.google.com/apikey',
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: 'Failed to process your message' },
      { status: 500 },
    );
  }
}
