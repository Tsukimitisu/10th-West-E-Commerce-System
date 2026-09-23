import React, { useEffect, useState } from 'react';
import { Search, ChevronDown, ChevronUp, HelpCircle, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getFAQs } from '../../services/api';

const PAYMENT_METHODS_ANSWER = 'Currently, customers can pay using Cash on Delivery. GCash via PayMongo and credit card payments are planned but not yet available.';
const PAYMENT_SECURITY_ANSWER = 'Cash on Delivery does not require card or e-wallet details. Never send payment credentials through chat or email.';

const defaultFAQs = [
  { category: 'Orders', question: 'How do I track my order?', answer: 'Go to My Account → My Orders and open an order to see its current status and Manual J&T details when available.' },
  { category: 'Orders', question: 'Can I cancel my order?', answer: 'Open the order in My Account → My Orders. If the order is still eligible for cancellation, the cancel action will be available there.' },
  { category: 'Shipping', question: 'How long does shipping take?', answer: 'The estimated delivery period is shown at checkout. Delivery is currently available within Luzon through the store-managed J&T process.' },
  { category: 'Shipping', question: 'Do you offer free shipping?', answer: 'The current free-shipping threshold and your progress toward it are shown in both the cart and checkout.' },
  { category: 'Returns', question: 'What is your return policy?', answer: 'Return eligibility and the request deadline are shown on each delivered order. See the Return & Refund Policy for details.' },
  { category: 'Returns', question: 'How do I request a return?', answer: 'Go to My Account → My Orders, open an eligible delivered order, and submit a return request with the required details and proof.' },
  { category: 'Payment', question: 'What payment methods do you accept?', answer: PAYMENT_METHODS_ANSWER },
  { category: 'Payment', question: 'Is my payment information secure?', answer: PAYMENT_SECURITY_ANSWER },
  { category: 'Products', question: 'How do I find parts for my motorcycle?', answer: 'Use the search bar to search by part name or browse categories. You can filter by brand and compatibility.' },
  { category: 'Products', question: 'Are your parts genuine/OEM?', answer: 'We carry both OEM and high-quality aftermarket parts. Each product listing clearly indicates the type.' },
];

const ensureAccuratePaymentWording = (faq) => {
  const question = String(faq?.question || '').toLowerCase();
  if (question.includes('payment method')) {
    return { ...faq, category: faq.category || 'Payment', answer: PAYMENT_METHODS_ANSWER };
  }
  if (question.includes('payment information') || question.includes('payment secure')) {
    return { ...faq, category: faq.category || 'Payment', answer: PAYMENT_SECURITY_ANSWER };
  }
  return faq;
};

const FAQ = () => {
  const [faqs, setFaqs] = useState(defaultFAQs);
  const [search, setSearch] = useState('');
  const [openIndex, setOpenIndex] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getFAQs();
        if (data && data.length > 0) setFaqs(data.map(ensureAccuratePaymentWording));
      } catch {}
    };
    load();
  }, []);

  const categories = ['All', ...Array.from(new Set(faqs.map((faq) => faq.category || 'General')))];
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = faqs.filter((faq) => {
    const question = String(faq.question || '');
    const answer = String(faq.answer || '');
    const category = faq.category || 'General';
    const matchesSearch = !normalizedSearch
      || question.toLowerCase().includes(normalizedSearch)
      || answer.toLowerCase().includes(normalizedSearch);
    return matchesSearch && (activeCategory === 'All' || category === activeCategory);
  });

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
        <div className="mb-10 text-center">
          <h1 className="mb-3 font-display text-3xl font-bold text-gray-900 md:text-4xl">Frequently Asked Questions</h1>
          <p className="text-gray-600">Find answers to common questions about orders, shipping, returns, and more.</p>
          <div className="mx-auto mt-4 h-1 w-20 -skew-x-[20deg] bg-red-600" />
        </div>

        <div className="relative mb-6">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search questions..." className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {categories.map((category) => (
            <button key={category} type="button" onClick={() => { setActiveCategory(category); setOpenIndex(null); }} className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${activeCategory === category ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {category}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 py-12 text-center">
            <HelpCircle size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">No matching questions found. Try a different search.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((faq, index) => (
              <div key={faq.id || `${faq.question}-${index}`} className={`rounded-xl border bg-gray-50 transition-all ${openIndex === index ? 'border-red-300 shadow-sm' : 'border-gray-200'}`}>
                <button type="button" onClick={() => setOpenIndex(openIndex === index ? null : index)} className="flex w-full items-center justify-between p-4 text-left" aria-expanded={openIndex === index}>
                  <div className="flex flex-1 items-start gap-3">
                    <HelpCircle size={16} className={`mt-0.5 flex-shrink-0 ${openIndex === index ? 'text-red-600' : 'text-gray-400'}`} />
                    <div>
                      <p className={`text-sm font-medium ${openIndex === index ? 'text-gray-900' : 'text-gray-700'}`}>{faq.question}</p>
                      <span className="mt-0.5 text-xs text-gray-500">{faq.category || 'General'}</span>
                    </div>
                  </div>
                  {openIndex === index ? <ChevronUp size={16} className="text-red-600" /> : <ChevronDown size={16} className="text-gray-400" />}
                </button>
                {openIndex === index && <div className="px-4 pb-4 pl-11"><p className="text-sm leading-relaxed text-gray-600">{faq.answer}</p></div>}
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
          <h3 className="mb-1 font-semibold text-gray-900">Still need help?</h3>
          <p className="mb-4 text-sm text-gray-600">Our support team is ready to assist you.</p>
          <Link to="/contact" className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700">
            <MessageSquare size={16} /> Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
};

export default FAQ;
