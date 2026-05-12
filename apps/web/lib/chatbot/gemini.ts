/**
 * Gemini AI client wrapper
 *
 * Uses Google Gemini 2.5 Flash (free tier) via @google/generative-ai
 * Get your free API key at: https://aistudio.google.com/apikey
 */
import {
  GoogleGenerativeAI,
  type GenerativeModel,
  type Tool,
  type Content,
} from '@google/generative-ai';

let client: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey',
      );
    }
    client = new GoogleGenerativeAI(apiKey);
  }
  return client;
}

export function createChatModel(tools: Tool[]): GenerativeModel {
  const genAI = getGeminiClient();
  return genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools,
    systemInstruction: `You are iTrade AI, a smart trading assistant for the iTrade platform.
You help users understand their trading performance, portfolio, strategies, and orders.

Guidelines:
- Always be concise but informative.
- When presenting financial data, format numbers clearly (e.g., "$1,234.56", "12.5%").
- When you have data to show, indicate what kind of visualization would be best: "table" for lists/rankings, "chart" for trends over time, or "text" for simple answers.
- For time-based questions like "last month", use period="1m" with align="calendar".
- Always mention the time period when discussing earnings or performance.
- If data shows a loss, be empathetic but factual.
- The user's data is private and already authenticated — you can trust the tool results.
- After receiving tool results, synthesize the data into a clear, human-readable answer.
- At the end of your response, if you have structured data, add a JSON block like:
  \`\`\`json
  {"renderAs": "table"|"chart"|"text", "title": "...", "data": {...}}
  \`\`\``,
  });
}

export type { Content };
