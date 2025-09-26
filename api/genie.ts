import { GoogleGenAI } from '@google/genai';
import type { Board, ImageElement } from '../ai-studio/types.ts';
import { buildWhiteboardContextSummary } from '../ai-studio/services/contextBuilder.ts';

interface GenieMessage {
  role: 'user' | 'genie';
  text: string;
}

interface GenieRequestBody {
  goal?: string;
  boards?: Board[];
  brandInfo?: {
    colors?: string[];
    logo?: ImageElement;
  };
  message?: string;
  history?: GenieMessage[];
}

const MAX_PROMPT_TOKENS = 6000;
const HISTORY_WINDOW_SIZE = 12;
const HISTORY_SUMMARY_MAX_CHARS = 4000;

const approximateTokenCount = (text: string): number => {
  // Gemini tokens are roughly 4 characters in Latin scripts; use a conservative ceil.
  return Math.ceil(text.length / 4);
};

const summarizeHistory = async (
  client: GoogleGenAI,
  history: GenieMessage[]
): Promise<string | null> => {
  if (history.length === 0) {
    return null;
  }

  try {
    const textToSummarize = formatHistory(history).slice(-HISTORY_SUMMARY_MAX_CHARS);
    if (!textToSummarize) {
      return null;
    }

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Summarize the following conversation between a user and Genie in under 150 words. Focus on the creative brief details, decisions already made, and any remaining open questions.\n\n${textToSummarize}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
      },
    });

    return response.text?.trim() || null;
  } catch (error) {
    console.warn('Failed to summarize Genie history; falling back to raw history window.', error);
    return null;
  }
};

const formatHistory = (history: GenieMessage[] = []): string => {
  if (!Array.isArray(history) || history.length === 0) {
    return 'No prior conversation.';
  }

  return history
    .map(entry => {
      const speaker = entry.role === 'genie' ? 'Genie' : 'User';
      return `${speaker}: ${entry.text}`;
    })
    .join('\n');
};

const buildSystemPrompt = (
  goal: string,
  availableBoardsDescription: string,
  brandInfoDescription: string
): string => {
  const goalLine = goal || 'Goal not provided yet.';
  const boardsSection = availableBoardsDescription || 'No content boards provided.';
  const brandSection = brandInfoDescription ? `\n${brandInfoDescription}` : '';

  return `You are "Genie," a helpful, context-aware AI assistant and creative collaborator. Your purpose is to help users generate high-quality creative briefs for a marketing campaign.

**Your Persona:**
- You are professional, knowledgeable, and proactive.
- You are concise and get straight to the point.
- You understand creative concepts, design, and marketing goals.

**Your Goal:**
- Your sole purpose is to help the user generate a perfect, detailed prompt.
- You will ask clarifying questions to fill in missing details.
- Once you have enough information, you will generate a single, comprehensive prompt for them to use.

**Your Knowledge (The Whiteboard Context):**
- The user has provided you with a high-level goal and the pre-analyzed assets on their whiteboard.
- **Goal:** ${goalLine}
- **Boards and Assets:**
${boardsSection}${brandSection}

**Your Workflow:**
1. Analyze: When the user begins a conversation, analyze the Goal and the Assets to identify any gaps or missing information.
2. Collaborate: If a key detail is missing (e.g., "What is the specific message or slogan?"), politely ask a single, concise question to get that information.
3. Generate: Once you have a complete picture of the user's vision (style, subject, message, brand info), generate the final prompt. Start the final prompt with [FINAL PROMPT]: to signal to the user that it's ready.

**Constraints:**
- You will ONLY discuss topics related to the creative brief.
- If the user asks an out-of-scope question (e.g., "What's the weather?"), politely state that you can only help with creative ideation.
- You will not generate the final creative or images yourself. You will only generate the prompt for the user.
`;
};

const buildFullPrompt = (
  systemPrompt: string,
  historyText: string,
  userMessage: string
): string => {
  return `${systemPrompt}

--- Conversation So Far ---
${historyText}

The user's latest message:
User: ${userMessage}

Follow the persona, workflow, and constraints above. If you have all necessary details, reply with the final creative brief prefixed by [FINAL PROMPT]:. Otherwise, ask exactly one concise clarifying question that keeps the conversation focused on the creative brief.`;
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { 'Allow': 'POST' },
    });
  }

  try {
    const body = (await request.json()) as GenieRequestBody;
    const goal = (body.goal ?? '').trim();
    const message = (body.message ?? '').trim();
    const boards = Array.isArray(body.boards) ? body.boards : [];
    const brandInfo = body.brandInfo;
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return new Response('Message is required.', { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
    return new Response('Genie is not configured. Missing GEMINI_API_KEY.', { status: 500 });
  }

    const client = new GoogleGenAI({ apiKey });

    const { availableBoardsDescription, brandInfoDescription } = buildWhiteboardContextSummary(boards, brandInfo);
    const systemPrompt = buildSystemPrompt(goal, availableBoardsDescription, brandInfoDescription);
    const recentHistory = history.slice(-HISTORY_WINDOW_SIZE);
    const earlierHistory = history.slice(0, Math.max(0, history.length - recentHistory.length));
    const historySummary = await summarizeHistory(client, earlierHistory);

    const historySections: string[] = [];
    if (historySummary) {
      historySections.push(`Summary of earlier conversation:\n${historySummary}`);
    }
    historySections.push(formatHistory(recentHistory));

    let historyText = historySections.join('\n\n');
    let fullPrompt = buildFullPrompt(systemPrompt, historyText, message);

    if (approximateTokenCount(fullPrompt) > MAX_PROMPT_TOKENS) {
      // Fall back to summary + the last few turns to ensure we stay within limits.
      const minimalRecentHistory = recentHistory.slice(-4);
      const fallbackSections: string[] = [];
      if (historySummary) {
        fallbackSections.push(`Conversation summary:\n${historySummary}`);
      }
      fallbackSections.push(`Most recent exchanges:\n${formatHistory(minimalRecentHistory)}`);
      historyText = fallbackSections.join('\n\n');
      fullPrompt = buildFullPrompt(systemPrompt, historyText, message);

      if (approximateTokenCount(fullPrompt) > MAX_PROMPT_TOKENS) {
        // Absolute safeguard: only send the most recent user/genie turns.
        const latestHistoryOnly = formatHistory(minimalRecentHistory.slice(-2));
        historyText = latestHistoryOnly;
        fullPrompt = buildFullPrompt(systemPrompt, historyText, message);
      }
    }

    const aiResponse = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: fullPrompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
      },
    });

    const reply = aiResponse.text?.trim();
    if (!reply) {
      throw new Error('Genie returned an empty response.');
    }

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error in /api/genie:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return new Response(message, { status: 500 });
  }
}
