import React, { useState } from 'react';
import { Mail, Phone, MapPin, Send, Clock, CheckCircle2, MessageSquare } from 'lucide-react';
import { createTicket } from '../../services/api';

const Contact: React.FC = () => {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '', category: 'general' });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createTicket(form);
      setSent(true);
    } catch {}
    setLoading(false);
  };

  if (sent) return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 size={32} className="text-green-600" />
      </div>
      <h2 className="font-display font-bold text-xl text-gray-900 mb-2">Message Sent!</h2>
      <p className="text-gray-500 text-sm mb-6">We've received your message and will get back to you within 24 hours.</p>
      <button onClick={() => { setSent(false); setForm({ name: '', email: '', subject: '', message: '', category: 'general' }); }}
        className="text-sm text-red-600 hover:text-red-700 font-medium">Send another message</button>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="font-display font-bold text-2xl text-gray-900 mb-2">Contact Us</h1>
        <p className="text-gray-500">Have a question or need help? We're here for you.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Contact info cards */}
        <div className="space-y-4">
          {[
            { icon: Phone, label: 'Call Us', value: '+63 917 123 4567', sub: 'Mon–Fri 9AM–6PM' },
            { icon: Mail, label: 'Email', value: 'support@10thwestmoto.com', sub: 'We reply within 24 hours' },
            { icon: MapPin, label: 'Visit Us', value: '10th West Ave, Quezon City', sub: 'Manila, Philippines 1100' },
            { icon: Clock, label: 'Business Hours', value: 'Monday – Saturday', sub: '9:00 AM – 6:00 PM' },
          ].map(item => (
            <div key={item.label} className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <item.icon size={18} className="text-red-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{item.label}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{item.value}</p>
                <p className="text-xs text-gray-400">{item.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><MessageSquare size={18} /> Send a Message</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500">
                <option value="general">General Inquiry</option>
                <option value="order">Order Support</option>
                <option value="product">Product Question</option>
                <option value="return">Returns & Refunds</option>
                <option value="technical">Technical Support</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input type="text" value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea value={form.message} onChange={e => setForm(f => ({...f, message: e.target.value}))} rows={5} required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={16} />}
              Send Message
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Contact;
