export const createClientMessageId = () => (
  globalThis.crypto?.randomUUID?.()
  || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
);

export const getMessageDeliveryStatus = (message = {}) => {
  if (message.client_status === 'sending' || message.client_status === 'failed') return message.client_status;
  if (message.is_read || message.read_at || message.seen_at || message.delivery_status === 'read' || message.status === 'read') return 'read';
  if (message.delivered_at || message.delivery_status === 'delivered' || message.status === 'delivered') return 'delivered';
  return 'sent';
};

export const upsertChatMessage = (messages, nextMessage) => {
  if (!nextMessage) return messages;
  const nextId = Number(nextMessage.id);
  const nextClientId = nextMessage.client_message_id || nextMessage.metadata?.client_message_id || null;
  const remaining = messages.filter((message) => {
    if (nextId && Number(message.id) === nextId) return false;
    const clientId = message.client_message_id || message.metadata?.client_message_id || null;
    return !nextClientId || clientId !== nextClientId;
  });
  return [...remaining, nextMessage].sort((a, b) => {
    const timeDelta = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    if (timeDelta) return timeDelta;
    return String(a.id || a.client_message_id || '').localeCompare(String(b.id || b.client_message_id || ''));
  });
};

export const createOptimisticMessage = ({ clientMessageId, conversationId, sender, text }) => ({
  id: `pending-${clientMessageId}`,
  client_message_id: clientMessageId,
  conversation_id: conversationId,
  thread_id: conversationId,
  sender_id: sender?.id,
  sender_role: sender?.role,
  message_text: text,
  body: text,
  message_type: 'text',
  media_urls: [],
  metadata: { client_message_id: clientMessageId },
  client_status: 'sending',
  created_at: new Date().toISOString(),
});
