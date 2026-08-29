import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Undo2 } from 'lucide-react';

const sections = [
  {
    title: 'Eligibility for Return',
    content: (
      <p>An item may be eligible when its delivered order still shows an active return window and the item is unused, complete, and in its original packaging. Approval is subject to inspection.</p>
    ),
  },
  {
    title: 'Non-Returnable Items',
    content: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Opened oils, lubricants, chemicals, and other consumables</li>
        <li>Custom-ordered or personalized items</li>
        <li>Items damaged by misuse, incorrect installation, modification, or normal wear</li>
        <li>Incomplete items or requests submitted after the order's return window</li>
      </ul>
    ),
  },
  {
    title: 'Return Request Period',
    content: (
      <p>Submit the request within the deadline shown on the delivered order. The current default window is 15 days after delivery, but the deadline displayed on your order is the one that applies.</p>
    ),
  },
  {
    title: 'Required Proof',
    content: (
      <p>Provide the order number, return reason, a clear description, and photos or other evidence when relevant. Keep the item and packaging until the request has been reviewed.</p>
    ),
  },
  {
    title: 'Refund Process',
    content: (
      <p>Approved items are inspected after they are returned. For Cash on Delivery orders, support will coordinate the available refund method after approval. A refund is not issued before the return is approved and inspected.</p>
    ),
  },
  {
    title: 'Exchange Policy',
    content: (
      <p>When an exchange is approved, support will confirm replacement availability. If the replacement is unavailable, the request may be handled as an approved return and a separate new order.</p>
    ),
  },
  {
    title: 'Damaged or Incorrect Items',
    content: (
      <p>Report a damaged, defective, or incorrect item promptly through the order's return request. Include clear photos of the item, packaging, and shipping label so the store can review the case.</p>
    ),
  },
  {
    title: 'Contact and Support Instructions',
    content: (
      <p>Open <Link to="/orders" className="font-semibold text-red-700 underline underline-offset-2 hover:text-red-800">My Orders</Link> to start or check a return. If the return action is unavailable or you need help, <Link to="/contact" className="font-semibold text-red-700 underline underline-offset-2 hover:text-red-800">contact support</Link> and include your order number.</p>
    ),
  },
];

const ReturnPolicy = () => (
  <div className="min-h-screen bg-slate-50 text-slate-900">
    <div className="mx-auto max-w-4xl px-4 py-10 sm:py-12">
      <Link to="/" className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-600 transition-colors hover:bg-white hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
        <ArrowLeft size={16} /> Back to Home
      </Link>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 md:p-10">
        <header className="mb-8 flex items-start gap-3 border-b border-slate-200 pb-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
            <Undo2 size={21} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-950 sm:text-3xl">Return &amp; Refund Policy</h1>
            <p className="mt-1 text-sm text-slate-600">A simple guide for return, exchange, and refund requests.</p>
          </div>
        </header>

        <ol className="list-decimal space-y-7 pl-6 marker:font-bold marker:text-red-700">
          {sections.map((section) => (
            <li key={section.title} className="pl-2">
              <h2 className="font-display text-lg font-semibold text-slate-950">{section.title}</h2>
              <div className="mt-2 text-sm leading-7 text-slate-700 sm:text-base">{section.content}</div>
            </li>
          ))}
        </ol>
      </article>
    </div>
  </div>
);

export default ReturnPolicy;
