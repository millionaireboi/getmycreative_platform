import type { Board, ImageElement } from '../types.ts';

export type GenieRole = 'user' | 'genie';

export interface GenieMessage {
  role: GenieRole;
  text: string;
}

export interface GenieBrandInfo {
  colors?: string[];
  logo?: ImageElement;
}

export interface GenieChatRequest {
  goal: string;
  boards: Board[];
  brandInfo?: GenieBrandInfo;
  message: string;
  history: GenieMessage[];
}

interface GenieChatResponse {
  reply: string;
}

export const sendGenieMessage = async (payload: GenieChatRequest): Promise<string> => {
  const response = await fetch('/api/genie', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to contact Genie.');
  }

  const data = (await response.json()) as GenieChatResponse;
  if (!data.reply) {
    throw new Error('Genie response was malformed.');
  }
  return data.reply;
};
