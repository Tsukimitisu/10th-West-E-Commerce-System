import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  CheckCheck,
  ImageIcon,
  MessageCircle,
  Package,
  Pin,
  PinOff,
  Search,
  Send,
  UserRound,
} from 'lucide-react';
import {
  API_ORIGIN,
  archiveSellerChat,
  getSellerChat,
  getSellerChatConversations,
  markSellerChatRead,
  pinSellerChat,
  sendSellerChatMessage,
} from '../../services/api';
import { useSocket } from '../../context/SocketContext';

const STAFF_ROLES = new Set(['owner', 'admin', 'store_staff', 'cashier', 'super_admin']);

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem('shopCoreUser') || 'null');
  } catch {
    return null;
  }
};

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

const ConversationRow = ({ conversation, active, onClick }) => {
  const product = conversation.product_snapshot || conversation.product || {};
  const image = resolveImageUrl(product.image_url);
  const unread = Number(conversation.seller_unread_count ?? conversation.unread_count ?? 0);

  return (
    <button
      type="button"
      onClick={() => onClick(conversation)}
      className={`w-full border-b border-slate-200 px-4 py-3 text-left transition-colors ${
        active ? 'bg-orange-50' : 'bg-white hover:bg-slate-50'
      }`}
    >
      <div className="flex gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          {image ? (
            <img src={image} alt={product.name || 'Product'} className="h-full w-full object-cover" />
          ) : (
            <Package size={18} className="text-slate-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-950">{conversation.buyer_name || 'Customer'}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{product.name || conversation.subject || 'Product chat'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {conversation.is_pinned && <Pin size={13} className="text-orange-600" />}
              {unread > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-orange-600 px-1.5 text-[11px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
          </div>
          <p className="mt-2 truncate text-xs text-slate-500">{conversation.last_message_text || 'No messages yet'}</p>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <span className="capitalize">{conversation.status || 'active'}</span>
            <span>{formatTime(conversation.last_message_at)}</span>
          </div>
        </div>
      </div>
    </button>
  );
};

const ProductPanel = ({ conversation }) => {
  const product = conversation?.product_snapshot || conversation?.product || {};
  const image = resolveImageUrl(product.image_url);
  const variant = product.variant;

  if (!conversation) return null;

  return (
    <aside className="hidden w-80 shrink-0 border-l border-slate-200 bg-white xl:block">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-950">Product Context</h3>
        <p className="mt-0.5 text-xs text-slate-500">Snapshot captured when the chat started</p>
      </div>
      <div className="p-4">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <div className="grid aspect-square place-items-center bg-white">
            {image ? (
              <img src={image} alt={product.name || 'Product'} className="h-full w-full object-cover" />
            ) : (
              <Package size={34} className="text-slate-300" />
            )}
          </div>
          <div className="space-y-2 p-3">
            <p className="line-clamp-2 text-sm font-semibold text-slate-950">{product.name || conversation.subject || 'Product'}</p>
            <p className="text-sm font-bold text-orange-700">{formatCurrency(variant?.price ?? product.price)}</p>
            {variant?.label && (
              <p className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">{variant.label}</p>
            )}
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
              <div className="rounded-lg bg-white p-2">
                <span className="block text-slate-400">Stock</span>
                <strong className="text-slate-900">{variant?.stock_quantity ?? product.stock_quantity ?? '-'}</strong>
              </div>
              <div className="rounded-lg bg-white p-2">
                <span className="block text-slate-400">Status</span>
                <strong className="capitalize text-slate-900">{String(product.status || '-').replace(/_/g, ' ')}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

const MessageBubble = ({ message }) => {
  const isStaff = STAFF_ROLES.has(String(message.sender_role || '').toLowerCase());
  const text = message.message_text ?? message.body ?? '';
  const imageUrl = resolveImageUrl(message.attachment_url || message.media_urls?.[0]);

  return (
    <div className={`flex ${isStaff ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] rounded-2xl px-4 py-2 shadow-sm ${
        isStaff ? 'rounded-br-md bg-orange-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-950'
      }`}>
        {imageUrl && (
          <a href={imageUrl} target="_blank" rel="noreferrer" className="mb-2 block overflow-hidden rounded-lg">
            <img src={imageUrl} alt="Attachment" className="max-h-60 w-full object-cover" />
          </a>
        )}
        {text && <p className="whitespace-pre-wrap text-sm leading-6">{text}</p>}
        <div className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${isStaff ? 'text-orange-100' : 'text-slate-400'}`}>
          <span>{formatTime(message.created_at)}</span>
          {isStaff && message.is_read && <CheckCheck size={12} />}
        </div>
      </div>
    </div>
  );
};

const ChatView = () => {
  const currentUser = useMemo(getCurrentUser, []);
  const { connected, emit, on, off } = useSocket();
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('active');
  const [draft, setDraft] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const typingTimerRef = useRef(null);

  const selectedConversation = conversations.find((item) => Number(item.id || item.conversation_id) === Number(selectedId)) || null;

  const loadConversations = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      const next = await getSellerChatConversations({
        search: query.trim(),
        status: filter === 'all' ? '' : filter,
      });
      setConversations(next);
      if (!selectedId && next[0]) setSelectedId(Number(next[0].id || next[0].conversation_id));
    } catch (err) {
      setError(err?.message || 'Unable to load chats.');
    } finally {
      setLoadingList(false);
    }
  }, [filter, query, selectedId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return undefined;

    let cancelled = false;
    setLoadingMessages(true);
    setError('');

    getSellerChat(selectedId)
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages || []);
        if (data.conversation) {
          setConversations((prev) => mergeConversation(prev, { ...data.conversation, seller_unread_count: 0, unread_count: 0 }));
        }
        return markSellerChatRead(selectedId).catch(() => null);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Unable to load this chat.');
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });

    emit('chat:join', { conversation_id: selectedId });

    return () => {
      cancelled = true;
      emit('chat:leave', { conversation_id: selectedId });
    };
  }, [emit, selectedId]);

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
        setMessages((prev) => (prev.some((item) => Number(item.id) === Number(incoming.id)) ? prev : [...prev, incoming]));
        markSellerChatRead(conversationId).catch(() => null);
      }
    };

    const handleConversationUpdated = (conversation = {}) => {
      setConversations((prev) => mergeConversation(prev, conversation));
    };

    const handleRead = (payload = {}) => {
      if (Number(payload.conversation_id || payload.thread_id) !== Number(selectedId)) return;
      setMessages((prev) => prev.map((message) => (
        STAFF_ROLES.has(String(message.sender_role || '').toLowerCase()) ? { ...message, is_read: true, read_at: payload.read_at } : message
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
    on('typing:start', handleTypingStart);
    on('typing:stop', handleTypingStop);

    return () => {
      off('message:new', handleNewMessage);
      off('conversation:updated', handleConversationUpdated);
      off('message:read', handleRead);
      off('typing:start', handleTypingStart);
      off('typing:stop', handleTypingStop);
    };
  }, [connected, currentUser?.id, off, on, selectedId]);

  const handleSend = async (event) => {
    event.preventDefault();
    const messageText = draft.trim();
    if (!messageText || !selectedId || sending) return;
    setSending(true);
    setDraft('');
    emit('typing:stop', { conversation_id: selectedId });
    try {
      const sent = await sendSellerChatMessage(selectedId, { message_text: messageText });
      setMessages((prev) => (prev.some((item) => Number(item.id) === Number(sent.id)) ? prev : [...prev, sent]));
      setConversations((prev) => mergeConversation(prev, {
        ...(selectedConversation || {}),
        id: selectedId,
        last_message_text: sent.message_text || sent.body || messageText,
        last_message_at: sent.created_at || new Date().toISOString(),
      }));
    } catch (err) {
      setDraft(messageText);
      setError(err?.message || 'Unable to send reply.');
    } finally {
      setSending(false);
    }
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

  const handlePin = async () => {
    if (!selectedConversation) return;
    const updated = await pinSellerChat(selectedConversation.id, !selectedConversation.is_pinned);
    setConversations((prev) => mergeConversation(prev, updated));
  };

  const handleArchive = async () => {
    if (!selectedConversation) return;
    const updated = await archiveSellerChat(selectedConversation.id, !selectedConversation.is_archived);
    setConversations((prev) => mergeConversation(prev, updated));
    if (!selectedConversation.is_archived) {
      setSelectedId(null);
      loadConversations();
    }
  };

  const filters = [
    ['active', 'Active'],
    ['unread', 'Unread'],
    ['pinned', 'Pinned'],
    ['archived', 'Archived'],
  ];

  return (
    <div className="h-[calc(100vh-120px)] min-h-[620px] overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-950 shadow-sm">
      <div className="grid h-full grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-h-0 border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="flex items-center gap-2 text-lg font-bold text-slate-950"><MessageCircle size={18} /> Chats</h1>
                <p className="text-xs text-slate-500">Product-based customer conversations</p>
              </div>
              <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            </div>

            <div className="mt-4 flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3">
              <Search size={16} className="text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') loadConversations();
                }}
                placeholder="Search customer or product"
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {filters.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`h-9 rounded-lg border text-xs font-semibold ${
                    filter === value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[calc(100%-145px)] overflow-y-auto">
            {loadingList ? (
              <div className="grid h-48 place-items-center text-sm text-slate-500">Loading chats...</div>
            ) : conversations.length === 0 ? (
              <div className="grid h-64 place-items-center px-6 text-center">
                <div>
                  <MessageCircle className="mx-auto text-slate-300" size={34} />
                  <p className="mt-3 text-sm font-semibold text-slate-800">No chats found</p>
                  <p className="mt-1 text-xs text-slate-500">Incoming product questions will appear here.</p>
                </div>
              </div>
            ) : (
              conversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id || conversation.conversation_id}
                  conversation={conversation}
                  active={Number(conversation.id || conversation.conversation_id) === Number(selectedId)}
                  onClick={(item) => setSelectedId(Number(item.id || item.conversation_id))}
                />
              ))
            )}
          </div>
        </aside>

        <section className="min-w-0 bg-slate-50">
          {selectedConversation ? (
            <div className="flex h-full">
              <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-bold text-slate-950">
                      <UserRound size={16} className="text-slate-500" />
                      {selectedConversation.buyer_name || 'Customer'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{typing ? 'Customer is typing...' : selectedConversation.buyer_email || 'Buyer conversation'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePin}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-orange-700"
                      title={selectedConversation.is_pinned ? 'Unpin chat' : 'Pin chat'}
                    >
                      {selectedConversation.is_pinned ? <PinOff size={16} /> : <Pin size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={handleArchive}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-orange-700"
                      title={selectedConversation.is_archived ? 'Restore chat' : 'Archive chat'}
                    >
                      {selectedConversation.is_archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                    </button>
                  </div>
                </header>

                {error && <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                  {loadingMessages ? (
                    <div className="grid h-48 place-items-center text-sm text-slate-500">Loading messages...</div>
                  ) : messages.length === 0 ? (
                    <div className="grid h-full place-items-center text-center">
                      <div>
                        <MessageCircle className="mx-auto text-slate-300" size={38} />
                        <p className="mt-3 text-sm font-semibold text-slate-800">No messages yet</p>
                        <p className="mt-1 text-xs text-slate-500">Send the first reply.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((message) => (
                        <MessageBubble key={message.id} message={message} />
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                <form onSubmit={handleSend} className="border-t border-slate-200 bg-white p-3">
                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500"
                      title="Image attachments are coming soon"
                    >
                      <ImageIcon size={18} />
                    </button>
                    <textarea
                      value={draft}
                      onChange={handleDraftChange}
                      rows={1}
                      placeholder="Type a reply"
                      className="max-h-28 min-h-11 flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-orange-500 focus:bg-white"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || sending}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-orange-600 text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                      aria-label="Send reply"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </form>
              </div>
              <ProductPanel conversation={selectedConversation} />
            </div>
          ) : (
            <div className="grid h-full place-items-center text-center">
              <div>
                <MessageCircle className="mx-auto text-slate-300" size={42} />
                <p className="mt-3 text-sm font-semibold text-slate-800">Select a chat</p>
                <p className="mt-1 text-xs text-slate-500">Choose a product conversation from the left.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default ChatView;
