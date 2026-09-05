import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, Send, X } from 'lucide-react';
import { createChatThread } from '../services/api';

const getContextFromPath = (pathname) => {
  const productMatch = pathname.match(/^\/products\/(\d+)/);
  if (productMatch) return { product_id: Number(productMatch[1]), subject: `Product #${productMatch[1]}` };
  const orderMatch = pathname.match(/^\/orders\/(\d+)/);
  if (orderMatch) return { order_id: Number(orderMatch[1]), subject: `Order #${orderMatch[1]}` };
  return { subject: 'Customer inquiry' };
};

const FloatingChatButton = ({ user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);

  const isCustomerPage = ['/', '/shop'].includes(location.pathname)
    || location.pathname.startsWith('/products/')
    || location.pathname.startsWith('/orders/');

  if (!isCustomerPage || ['owner', 'admin', 'store_staff', 'super_admin'].includes(user?.role)) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user?.id) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }

    const body = message.trim() || 'Hi, I need help with an item.';
    setSending(true);
    setStatus('');
    try {
      await createChatThread({
        ...getContextFromPath(location.pathname),
        message: body,
      });
      setMessage('');
      setStatus('Message sent. The seller will reply here soon.');
    } catch (error) {
      setStatus(error?.message || 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <form onSubmit={handleSubmit} className="mb-3 w-[min(92vw,340px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-900">Chat Seller</p>
              <p className="text-xs text-gray-500">Ask about fitment, stock, or your order.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1 text-gray-500 hover:bg-gray-100">
              <X size={17} />
            </button>
          </div>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
            placeholder="Type your message..."
          />
          {status && <p className="mt-2 text-xs text-gray-600">{status}</p>}
          <button
            type="submit"
            disabled={sending}
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            <Send size={16} /> {sending ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-2xl hover:bg-red-700"
        aria-label="Chat seller"
      >
        <MessageCircle size={24} />
      </button>
    </div>
  );
};

export default FloatingChatButton;

