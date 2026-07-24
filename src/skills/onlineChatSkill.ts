import { cloudClient, CloudResult } from '../cloud/cloudClient';

export interface ChatMessagePayload {
  role: 'user' | 'assistant';
  content: string;
}

export interface OnlineChatResponseData {
  requestId: string;
  reply: string;
  model: string;
  usage: Record<string, any>;
  createdAt: string;
}

export const onlineChatSkill = {
  /**
   * Executes explicit Online Assistant chat request via cloud API proxy to DeepSeek-V4 Flash.
   * Core scheduling, NLU, and voice scheduling are strictly excluded from this path.
   */
  sendChatMessage: async (messages: ChatMessagePayload[]): Promise<CloudResult<OnlineChatResponseData>> => {
    // Input capping: max 10 messages, max 8000 total characters
    const pagedMessages = messages.slice(-10);
    const totalChars = pagedMessages.reduce((sum, m) => sum + m.content.length, 0);

    if (totalChars > 8000) {
      return {
        status: 'validation_error',
        error: 'Conversation history exceeds limit of 8,000 characters for Online Assistant.',
      };
    }

    return await cloudClient.request<OnlineChatResponseData>(
      '/v1/ai/chat',
      {
        method: 'POST',
        body: JSON.stringify({
          messages: pagedMessages,
        }),
      },
      true
    );
  }
};
