import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Inbox,
  MessageCircle,
  Package,
  Search,
  Send,
} from 'lucide-react';
import {
  API_ORIGIN,
  getBuyerChatConversations,
  getChatConversationMessages,
  markConversationRead,
  sendConversationMessage,
} from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { getCurrentAuthUser } from '../../services/authSession';
import { handleProductImageError, PRODUCT_IMAGE_FALLBACK, resolveProductImageUrl } from '../../utils/productImages.js';
import MessageDeliveryStatus from '../../components/chat/MessageDeliveryStatus.jsx';
import {
  createClientMessageId,
  createOptimisticMessage,
  upsertChatMessage,
} from '../../utils/chatMessages.js';

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const formatCurrency = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(number);
};

const resolveImageUrl = (url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
  return url;
};

const resolveProductSnapshotImageUrl = (url) => {
  if (!url) return null;
  const resolved = resolveProductImageUrl(url);
  if (resolved === PRODUCT_IMAGE_FALLBACK) return resolved;
  return resolveImageUrl(resolved);
};

const mergeConversation = (items, next) => {
  if (!next?.id && !next?.conversation_id) return items;
  const id = Number(next.id || next.conversation_id);
  const normalized = { ...next, id };
  const rest = items.filter((item) => Number(item.id || item.conversation_id) !== id);
  return [normalized, ...rest].sort((a, b) => {
    const pinnedDelta = Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned));
    if (pinnedDelta) return pinnedDelta;
    return new Date(b.last_message_at || b.updated_at || 0) - new Date(a.last_message_at || a.updated_at || 0);
  });
};

const ConversationListItem = ({ conversation, active, onSelect }) => {
  const product = conversation.product_snapshot || conversation.product || {};
  const image = resolveProductSnapshotImageUrl(product.image_url);

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation)}
      className={`w-full border-b border-slate-200 px-4 py-3 text-left transition-colors ${
        active ? 'bg-orange-50' : 'bg-white hover:bg-slate-50'
      }`}
    >
      <div className="flex gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          {image ? (
            <img src={image} alt={product.name || 'Product'} onError={handleProductImageError} className="h-full w-full object-cover" />
          ) : (
            <Package size={18} className="text-slate-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">{product.name || conversation.subject || 'Product chat'}</p>
            {conversation.unread_count > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-orange-600 px-1.5 text-[11px] font-bold text-white">
                {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">{conversation.last_message_text || 'No messages yet'}</p>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>{conversation.seller_name || '10th West Moto'}</span>
            <span>{formatTime(conversation.last_message_at)}</span>
          </div>
        </div>
      </div>
    </button>
  );
};

const ProductContext = ({ conversation }) => {
  const product = conversation?.product_snapshot || conversation?.product || {};
  const image = resolveProductSnapshotImageUrl(product.image_url);
  const variant = product.variant;

  if (!conversation) return null;

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          {image ? (
            <img src={image} alt={product.name || 'Product'} onError={handleProductImageError} className="h-full w-full object-cover" />
          ) : (
            <Package size={20} className="text-slate-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Link to={product.id ? `/products/${product.id}` : '/shop'} className="line-clamp-1 text-sm font-semibold text-slate-950 hover:text-orange-600">
            {product.name || conversation.subject || 'Product chat'}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {variant?.label && <span className="rounded-full border border-slate-200 px-2 py-0.5">{variant.label}</span>}
            <span>{formatCurrency(variant?.price ?? product.price)}</span>
            {product.status && <span className="capitalize">{String(product.status).replace(/_/g, ' ')}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

const MessageBubble = ({ message, currentUserId, onRetry }) => {
  const mine = Number(message.sender_id) === Number(currentUserId);
  const text = message.message_text ?? message.body ?? '';
  const imageUrl = resolveImageUrl(message.attachment_url || message.media_urls?.[0]);

  return (
    <div className={`flex min-w-0 ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`min-w-0 max-w-[85%] break-words rounded-2xl px-4 py-2 shadow-sm [overflow-wrap:anywhere] ${
        mine ? 'rounded-br-md bg-orange-600 text-white' : 'rounded-bl-md bg-white text-slate-900 border border-slate-200'
      }`}>
        {imageUrl && (
          <a href={imageUrl} target="_blank" rel="noreferrer" className="mb-2 block overflow-hidden rounded-lg">
            <img src={imageUrl} alt="Attachment" className="max-h-60 w-full object-cover" />
          </a>
        )}
        {text && <p className="whitespace-pre-wrap text-sm leading-6">{text}</p>}
        <div className={`mt-1 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[11px] ${mine ? 'text-orange-100' : 'text-slate-400'}`}>
          <span>{formatTime(message.created_at)}</span>
          {mine && <MessageDeliveryStatus message={message} onRetry={onRetry} />}
        </div>
      </div>
    </div>
  );
};

const Messages = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useMemo(() => getCurrentAuthUser(), []);
  const { connected, emit, on, off } = useSocket();
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(() => Number(searchParams.get('conversation')) || null);
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [draft, setDraft] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [typing, setTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);
  const selectedIdRef = useRef(selectedId);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const selectedConversation = conversations.find((item) => Number(item.id || item.conversation_id) === Number(selectedId)) || null;

  const refreshConversations = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      const next = await getBuyerChatConversations({
        search: query.trim(),
        status: status === 'all' ? '' : status,
      });
      setConversations(next);
      const requestedId = Number(searchParams.get('conversation')) || null;
      if (requestedId && next.some((item) => Number(item.id || item.conversation_id) === requestedId)) {
        setSelectedId(requestedId);
      } else if (!selectedId && next[0] && window.matchMedia('(min-width: 1024px)').matches) {
        setSelectedId(Number(next[0].id || next[0].conversation_id));
      }
    } catch (err) {
      setError(err?.message || 'Unable to load messages.');
    } finally {
      setLoadingList(false);
    }
  }, [query, searchParams, selectedId, status]);

  useEffect(() => {
    if (!currentUser) {
      navigate('/login?redirect=/messages', { replace: true });
      return;
    }
    refreshConversations();
  }, [currentUser, navigate, refreshConversations]);

  useEffect(() => {
    if (!selectedId) return undefined;

    let cancelled = false;
    setLoadingMessages(true);
    setError('');

    getChatConversationMessages(selectedId, { limit: 200 })
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages || []);
        if (data.conversation) {
          setConversations((prev) => mergeConversation(prev, { ...data.conversation, unread_count: 0 }));
        }
        return markConversationRead(selectedId).catch(() => null);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Unable to load this conversation.');
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });

    emit('chat:join', { conversation_id: selectedId });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('conversation', String(selectedId));
      return next;
    }, { replace: true });

    return () => {
      cancelled = true;
      emit('chat:leave', { conversation_id: selectedId });
    };
  }, [emit, selectedId, setSearchParams]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, selectedId]);

  useEffect(() => {
    if (!connected) return undefined;

    const handleNewMessage = (payload = {}) => {
      const incoming = payload.message;
      const conversation = payload.conversation || payload.thread;
      const conversationId = Number(incoming?.conversation_id || incoming?.thread_id || conversation?.id);
      if (!conversationId) return;

      setConversations((prev) => mergeConversation(prev, {
        ...(conversation || {}),
        id: conversationId,
        last_message_text: incoming?.message_text || incoming?.body || conversation?.last_message_text,
        last_message_at: incoming?.created_at || conversation?.last_message_at,
      }));

      if (Number(selectedId) === conversationId && incoming?.id) {
        setMessages((prev) => upsertChatMessage(prev, incoming));
        markConversationRead(conversationId).catch(() => null);
      }
    };

    const handleConversationUpdated = (conversation) => {
      setConversations((prev) => mergeConversation(prev, conversation));
    };

    const handleRead = (payload = {}) => {
      if (Number(payload.conversation_id || payload.thread_id) !== Number(selectedId)) return;
      setMessages((prev) => prev.map((message) => (
        Number(message.sender_id) === Number(currentUser?.id)
          ? { ...message, is_read: true, delivered_at: message.delivered_at || payload.read_at, read_at: payload.read_at, delivery_status: 'read', status: 'read' }
          : message
      )));
    };

    const handleDelivered = (payload = {}) => {
      if (Number(payload.conversation_id || payload.thread_id) !== Number(selectedId)) return;
      const deliveredIds = new Set((payload.message_ids || []).map(Number));
      setMessages((prev) => prev.map((message) => (
        deliveredIds.has(Number(message.id)) && Number(message.sender_id) === Number(currentUser?.id) && !message.is_read
          ? { ...message, delivered_at: payload.delivered_at, delivery_status: 'delivered', status: 'delivered' }
          : message
      )));
    };

    const handleTypingStart = (payload = {}) => {
      if (Number(payload.conversation_id || payload.thread_id) !== Number(selectedId)) return;
      if (Number(payload.user_id) === Number(currentUser?.id)) return;
      setTyping(true);
    };

    const handleTypingStop = (payload = {}) => {
      if (Number(payload.conversation_id || payload.thread_id) !== Number(selectedId)) return;
      setTyping(false);
    };

    on('message:new', handleNewMessage);
    on('conversation:updated', handleConversationUpdated);
    on('message:read', handleRead);
    on('message:delivered', handleDelivered);
    on('typing:start', handleTypingStart);
    on('typing:stop', handleTypingStop);

    return () => {
      off('message:new', handleNewMessage);
      off('conversation:updated', handleConversationUpdated);
      off('message:read', handleRead);
      off('message:delivered', handleDelivered);
      off('typing:start', handleTypingStart);
      off('typing:stop', handleTypingStop);
    };
  }, [connected, currentUser?.id, off, on, selectedId]);

  const handleSelectConversation = (conversation) => {
    setSelectedId(Number(conversation.id || conversation.conversation_id));
  };

  const handleDraftChange = (event) => {
    setDraft(event.target.value);
    if (!selectedId) return;
    emit('typing:start', { conversation_id: selectedId });
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      emit('typing:stop', { conversation_id: selectedId });
    }, 800);
  };

  const transmitMessage = async (pendingMessage) => {
    const conversationId = Number(pendingMessage.conversation_id || pendingMessage.thread_id);
    const messageText = String(pendingMessage.message_text || pendingMessage.body || '').trim();
    if (!messageText || !conversationId || sending) return;
    setSending(true);
    setMessages((prev) => upsertChatMessage(prev, { ...pendingMessage, client_status: 'sending' }));
    try {
      const sent = await sendConversationMessage(conversationId, {
        message_text: messageText,
        client_message_id: pendingMessage.client_message_id,
      });
      if (Number(selectedIdRef.current) === conversationId) {
        setMessages((prev) => upsertChatMessage(prev, sent));
      }
      setConversations((prev) => mergeConversation(prev, {
        ...(selectedConversation || {}),
        id: conversationId,
        last_message_text: sent.message_text || sent.body || messageText,
        last_message_at: sent.created_at || new Date().toISOString(),
      }));
    } catch (err) {
      if (Number(selectedIdRef.current) === conversationId) {
        setMessages((prev) => upsertChatMessage(prev, {
          ...pendingMessage,
          client_status: 'failed',
          send_error: err?.message || 'Unable to send message.',
        }));
      }
      setError(err?.message || 'Unable to send message. Use Retry on the failed message.');
    } finally {
      setSending(false);
    }
  };

  const handleSend = (event) => {
    event.preventDefault();
    const messageText = draft.trim();
    if (!messageText || !selectedId || sending) return;
    const clientMessageId = createClientMessageId();
    const optimisticMessage = createOptimisticMessage({
      clientMessageId,
      conversationId: selectedId,
      sender: currentUser,
      text: messageText,
    });
    setDraft('');
    setError('');
    emit('typing:stop', { conversation_id: selectedId });
    setMessages((prev) => upsertChatMessage(prev, optimisticMessage));
    void transmitMessage(optimisticMessage);
  };

  const handleRetry = (message) => {
    if (sending || message.client_status !== 'failed') return;
    setError('');
    void transmitMessage(message);
  };

  const filteredEmpty = !loadingList && conversations.length === 0;

  return (
    <main className="h-[calc(100dvh-4rem)] min-h-0 max-w-full overflow-x-hidden bg-slate-100 text-slate-950">
      <div className="mx-auto flex h-full min-h-0 max-w-7xl flex-col px-0 md:px-4 md:py-4">
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden border border-slate-200 bg-white shadow-sm md:rounded-lg">
          <aside className={`${selectedConversation ? 'hidden md:flex' : 'flex'} min-h-0 min-w-0 w-full flex-col border-r border-slate-200 bg-white md:w-96`}>
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h1 className="text-lg font-bold text-slate-950">Messages</h1>
                  <p className="text-xs text-slate-500">Product chats with 10th West Moto</p>
                </div>
                <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              </div>
              <div className="mt-4 flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3">
                <Search size={16} className="text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') refreshConversations();
                  }}
                  placeholder="Search chats"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {['all', 'unread', 'archived'].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setStatus(item)}
                    className={`h-9 rounded-lg border text-xs font-semibold capitalize ${
                      status === item ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loadingList ? (
                <div className="grid h-48 place-items-center text-sm text-slate-500">Loading chats...</div>
              ) : filteredEmpty ? (
                <div className="grid h-64 place-items-center px-6 text-center">
                  <div>
                    <Inbox className="mx-auto text-slate-300" size={34} />
                    <p className="mt-3 text-sm font-semibold text-slate-800">No chats found</p>
                    <p className="mt-1 text-xs text-slate-500">Start from a product page to contact the seller.</p>
                  </div>
                </div>
              ) : (
                conversations.map((conversation) => (
                  <ConversationListItem
                    key={conversation.id || conversation.conversation_id}
                    conversation={conversation}
                    active={Number(conversation.id || conversation.conversation_id) === Number(selectedId)}
                    onSelect={handleSelectConversation}
                  />
                ))
              )}
            </div>
          </aside>

          <section className={`${selectedConversation ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50`}>
            {selectedConversation ? (
              <>
                <div className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(null);
                      setSearchParams((previous) => {
                        const next = new URLSearchParams(previous);
                        next.delete('conversation');
                        return next;
                      }, { replace: true });
                    }}
                    className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-950">{selectedConversation.seller_name || '10th West Moto'}</p>
                    <p className="text-xs text-slate-500">{typing ? 'Typing...' : connected ? 'Online' : 'Connecting...'}</p>
                  </div>
                </div>

                <ProductContext conversation={selectedConversation} />

                {error && (
                  <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
                  {loadingMessages ? (
                    <div className="grid h-48 place-items-center text-sm text-slate-500">Loading messages...</div>
                  ) : messages.length === 0 ? (
                    <div className="grid h-full place-items-center text-center">
                      <div>
                        <MessageCircle className="mx-auto text-slate-300" size={38} />
                        <p className="mt-3 text-sm font-semibold text-slate-800">No messages yet</p>
                        <p className="mt-1 text-xs text-slate-500">Send a message about this product.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((message) => (
                        <MessageBubble key={message.id} message={message} currentUserId={currentUser?.id} onRetry={handleRetry} />
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                <form onSubmit={handleSend} className="border-t border-slate-200 bg-white p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={handleDraftChange}
                      rows={1}
                      placeholder="Type a message"
                      className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-orange-500 focus:bg-white"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || sending}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-orange-600 text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                      aria-label="Send message"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-center">
                <div>
                  <MessageCircle className="mx-auto text-slate-300" size={42} />
                  <p className="mt-3 text-sm font-semibold text-slate-800">Select a conversation</p>
                  <p className="mt-1 text-xs text-slate-500">Your product chat will appear here.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};

export default Messages;
