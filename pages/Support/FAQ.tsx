import React, { useState, useEffect } from 'react';
import { Search, ChevronDown, ChevronUp, HelpCircle, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getFAQs } from '../../services/api';

const defaultFAQs = [
  { category: 'Orders', question: 'How do I track my order?', answer: 'Go to My Account → Orders and click on your order to see the latest tracking information.' },
  { category: 'Orders', question: 'Can I cancel my order?', answer: 'You can cancel your order within 1 hour of placing it. Go to My Account → Orders, find the order and click Cancel.' },
  { category: 'Shipping', question: 'How long does shipping take?', answer: 'Standard shipping takes 3–7 business days within Metro Manila. Express shipping delivers within 1–2 business days.' },
  { category: 'Shipping', question: 'Do you offer free shipping?', answer: 'Yes! Orders over ₱2,500 qualify for free standard shipping.' },
  { category: 'Returns', question: 'What is your return policy?', answer: 'We accept returns within 15 days of delivery. Items must be unused and in original packaging. See our Returns page for details.' },
  { category: 'Returns', question: 'How do I request a return?', answer: 'Go to My Account → Orders, select the order, and click "Request Return". Fill out the form and we\'ll provide a return label.' },
  { category: 'Payment', question: 'What payment methods do you accept?', answer: 'We accept credit/debit cards (Visa, Mastercard), GCash, and Cash on Delivery (COD).' },
  { category: 'Payment', question: 'Is my payment information secure?', answer: 'Yes, all payments are processed through Stripe with industry-standard SSL encryption.' },
  { category: 'Products', question: 'How do I find parts for my motorcycle?', answer: 'Use the search bar to search by part name or browse categories. You can filter by brand and compatibility.' },
  { category: 'Products', question: 'Are your parts genuine/OEM?', answer: 'We carry both OEM and high-quality aftermarket parts. Each product listing clearly indicates the type.' },
];

const FAQ: React.FC = () => {
  const [faqs, setFaqs] = useState<any[]>(defaultFAQs);
  const [search, setSearch] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getFAQs();
        if (data && data.length > 0) setFaqs(data);
      } catch {}
    };
    load();
  }, []);

  const categories = ['All', ...Array.from(new Set(faqs.map(f => f.category)))];

  const filtered = faqs.filter(f => {
    const matchesSearch = !search || f.question.toLowerCase().includes(search.toLowerCase()) || f.answer.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === 'All' || f.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h1 className="font-display font-bold text-2xl text-gray-900 mb-2">Frequently Asked Questions</h1>
        <p className="text-gray-500">Find answers to common questions about orders, shipping, returns, and more.</p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search questions..."
          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
      </div>

      {/* Categories */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {categories.map(cat => (
          <button key={cat} onClick={() => { setActiveCategory(cat); setOpenIndex(null); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${activeCategory === cat ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Accordion */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <HelpCircle size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">No matching questions found. Try a different search.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((faq, i) => (
            <div key={i} className={`bg-white rounded-xl border transition-all ${openIndex === i ? 'border-red-200 shadow-sm' : 'border-gray-100'}`}>
              <button onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between p-4 text-left">
                <div className="flex items-start gap-3 flex-1">
                  <HelpCircle size={16} className={`mt-0.5 flex-shrink-0 ${openIndex === i ? 'text-red-500' : 'text-gray-400'}`} />
                  <div>
                    <p className={`text-sm font-medium ${openIndex === i ? 'text-gray-900' : 'text-gray-700'}`}>{faq.question}</p>
                    <span className="text-xs text-gray-400 mt-0.5">{faq.category}</span>
                  </div>
                </div>
                {openIndex === i ? <ChevronUp size={16} className="text-red-500" /> : <ChevronDown size={16} className="text-gray-400" />}
              </button>
              {openIndex === i && (
                <div className="px-4 pb-4 pl-11">
                  <p className="text-sm text-gray-600 leading-relaxed">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Still need help */}
      <div className="mt-10 bg-gray-50 rounded-xl p-6 text-center">
        <h3 className="font-semibold text-gray-900 mb-1">Still need help?</h3>
        <p className="text-sm text-gray-500 mb-4">Our support team is ready to assist you.</p>
        <Link to="/contact" className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors">
          <MessageSquare size={16} /> Contact Support
        </Link>
      </div>
    </div>
  );
};

export default FAQ;
