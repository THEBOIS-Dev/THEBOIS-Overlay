import { api } from './index';
import { getLinkedApiKey } from './telemetry-service';

export interface SupportConversationSummary {
  id: string;
  subject: string;
  status: string;
  createdAt: number;
  updatedAt: string | null;
}

export interface SupportMessage {
  id: string;
  body: string;
  fromSupport: boolean;
  senderName: string | null;
  senderAvatarUrl: string | null;
  createdAt: string;
}

export interface SupportConversationDetail {
  id: string;
  subject: string;
  status: string;
  messages: SupportMessage[];
}

export type SupportResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function supportFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<SupportResult<T>> {
  const apiKey = await getLinkedApiKey();
  if (apiKey === null) {
    return { ok: false, error: 'Link your Discord account to use Support.' };
  }

  let response: Response;
  try {
    response = await fetch(`${api}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  } catch {
    return {
      ok: false,
      error: 'Could not reach the support server. Check your connection.',
    };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: body?.error ?? 'Something went wrong. Please try again.' };
  }

  return { ok: true, data: (await response.json()) as T };
}

export async function listConversations(): Promise<
  SupportResult<{ conversations: SupportConversationSummary[] }>
> {
  return supportFetch('/api/support/conversations');
}

export async function createConversation(
  subject: string,
  message: string,
): Promise<SupportResult<SupportConversationSummary>> {
  return supportFetch('/api/support/conversations', {
    method: 'POST',
    body: JSON.stringify({ subject, message }),
  });
}

export async function getConversation(
  id: string,
): Promise<SupportResult<SupportConversationDetail>> {
  return supportFetch(`/api/support/conversations/${encodeURIComponent(id)}`);
}

export async function replyToConversation(
  id: string,
  message: string,
): Promise<SupportResult<SupportMessage>> {
  return supportFetch(`/api/support/conversations/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}
