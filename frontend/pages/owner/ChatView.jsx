import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, UserRound, Package, ShoppingCart, CheckCheck } from 'lucide-react';
import { getChatThread, getChatThreads, markChatThreadRead, sendChatMessage } from '../../services/api';
import { useSocketEvent } from '../../context/SocketContext';

const ChatView = () => {
  const [threads, setThreads] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [threadDetail, setThreadDetail] = useState(null);
  const [messageBody, setMessageBody] = useState('');
  const [loading, setLoading] = useState(true);

  const selectedThread = useMemo(
    () => threads.find((thread) => Number(thread.id) === Number(selectedThreadId)) || threadDetail?.thread || null,
    [threads, selectedThreadId, threadDetail],
  );

  const loadThreads = async () => {
    const data = await getChatThreads();
    setThreads(Array.isArray(data) ? data : []);
    setLoading(false);
    if (!selectedThreadId && data?.length > 0) setSelectedThreadId(data[0].id);
  };

  const loadThread = async (threadId) => {
    if (!threadId) return;
    const data = await getChatThread(threadId);
    setThreadDetail(data);
    await markChatThreadRead(threadId).catch(() => {});
    setThreads((prev) => prev.map((thread) => Number(thread.id) === Number(threadId) ? { ...thread, unread_count: 0 } : thread));
  };

  useEffect(() => { loadThreads(); }, []);
  useEffect(() => { loadThread(selectedThreadId); }, [selectedThreadId]);

  useSocketEvent('chat:message', (payload) => {
    loadThreads();
    if (Number(payload?.message?.thread_id) === Number(selectedThreadId)) {
      loadThread(selectedThreadId);
    }
  });
  useSocketEvent('chat:assigned', loadThreads);
  useSocketEvent('chat:seen', (payload) => {
    if (Number(payload?.thread_id) === Number(selectedThreadId)) loadThread(selectedThreadId);
  });

  const handleSend = async (event) => {
    event.preventDefault();
    const body = messageBody.trim();
    if (!body || !selectedThreadId) return;
    setMessageBody('');
    await sendChatMessage(selectedThreadId, { body, message_type: 'text' });
    await loadThread(selectedThreadId);
    await loadThreads();
  };

  const messages = threadDetail?.messages || [];

  return (
    <div className="h-[calc(100vh-120px)] min-h-[620px] grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4">
      <div className="rounded-xl border border-white/10 bg-gradient-to-b from-[#1a1d23] to-[#111318] overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h1 className="font-display font-bold text-lg text-white flex items-center gap-2"><MessageCircle size={18} /> Chats</h1>
          <p className="text-xs text-gray-400">Customer, order, and product conversations</p>
        </div>
        <div className="overflow-y-auto h-[calc(100%-73px)]">
          {loading ? (
            <div className="p-6 text-sm text-gray-400">Loading chats...</div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-sm text-gray-400">No chats yet.</div>
          ) : threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => setSelectedThreadId(thread.id)}
              className={`w-full text-left p-4 border-b border-white/10 transition-colors ${Number(selectedThreadId) === Number(thread.id) ? 'bg-red-500/10' : 'hover:bg-[#202430]'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{thread.customer_name || 'Customer'}</p>
                  <p className="text-xs text-gray-400 truncate">{thread.subject || thread.product_name || (thread.order_id ? `Order #${thread.order_id}` : 'General chat')}</p>
                </div>
                {Number(thread.unread_count || 0) > 0 && (
                  <span className="min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold inline-flex items-center justify-center">{thread.unread_count}</span>
                )}
              </div>
              {thread.last_message_body && <p className="mt-2 text-xs text-gray-500 truncate">{thread.last_message_body}</p>}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-gradient-to-b from-[#1a1d23] to-[#111318] overflow-hidden flex flex-col">
        {selectedThread ? (
          <>
            <div className="p-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white flex items-center gap-2"><UserRound size={16} /> {selectedThread.customer_name || 'Customer'}</p>
                <p className="text-xs text-gray-400">{selectedThread.customer_email || selectedThread.subject || 'Conversation'}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {selectedThread.order_id && <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 text-blue-300 px-2 py-1"><ShoppingCart size={12} /> Order #{selectedThread.order_id} {selectedThread.order_status || ''}</span>}
                {selectedThread.product_name && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-300 px-2 py-1"><Package size={12} /> {selectedThread.product_name}</span>}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((message) => {
                const isStaff = ['owner', 'admin', 'store_staff', 'cashier', 'super_admin'].includes(message.sender_role);
                return (
                  <div key={message.id} className={`flex ${isStaff ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] rounded-2xl px-4 py-2 ${isStaff ? 'bg-red-500 text-white' : 'bg-[#202430] text-gray-100 border border-white/10'}`}>
                      <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                      <p className={`mt-1 text-[10px] ${isStaff ? 'text-red-100' : 'text-gray-500'} flex items-center gap-1`}>
                        {message.sender_name || 'User'} • {new Date(message.created_at).toLocaleString()}
                        {message.seen_at && <CheckCheck size={11} />}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSend} className="p-4 border-t border-white/10 flex gap-2">
              <input
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-[#202430] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                placeholder="Type a reply..."
              />
              <button type="submit" className="w-12 rounded-xl bg-red-500 hover:bg-red-600 text-white inline-flex items-center justify-center">
                <Send size={18} />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Select a chat thread</div>
        )}
      </div>
    </div>
  );
};

export default ChatView;
