import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RotateCcw } from 'lucide-react';

const ReturnPolicy = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-orange-500 mb-6 transition-colors">
          <ArrowLeft size={16} /> Back to Home
        </Link>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <RotateCcw size={20} className="text-orange-500" />
            </div>
            <div>
              <h1 className="font-display font-bold text-2xl text-gray-900">Return & Refund Policy</h1>
              <p className="text-sm text-gray-500">Last updated: March 1, 2026</p>
            </div>
          </div>

          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed space-y-6">
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm">
              <p className="font-medium text-gray-900 mb-1">
                This policy complies with DTI Department Administrative Order No. 21-01 (Rules and Regulations on
                E-Commerce) and the Consumer Act of the Philippines (RA 7394).
              </p>
            </div>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">1. 7-Day Return Right (Change of Mind)</h2>
            <p>
              Under <strong>DTI DAO 21-01 Section 12</strong>, you have the right to return any product purchased online within
              <strong> 7 calendar days from the date you receive the delivery</strong>, even without any defect ("change of mind" return).
            </p>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <p className="font-medium text-sm text-gray-900 mb-2">Conditions for Change-of-Mind Returns:</p>
              <ul className="list-disc pl-4 space-y-1 text-sm">
                <li>The product must be <strong>unused</strong> and in its <strong>original packaging</strong></li>
                <li>All tags, seals, and accessories must be intact</li>
                <li>You must provide the order number and proof of purchase</li>
                <li>Return shipping costs are borne by the customer</li>
              </ul>
            </div>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">2. Defective or Wrong Items</h2>
            <p>
              If you receive a defective, damaged, or wrong item, you may request a return/replacement at any time
              within the warranty period. In such cases:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Return shipping costs are covered by 10th West Moto Parts</li>
              <li>You may choose between a <strong>full refund</strong>, <strong>replacement</strong>, or <strong>store credit</strong></li>
              <li>Please include photos of the defective/wrong item with your return request</li>
              <li>We will inspect returned items and process your request within <strong>5 business days</strong> of receiving the return</li>
            </ul>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">3. Non-Returnable Items</h2>
            <p>The following items cannot be returned:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Opened consumable products (oils, lubricants, chemicals)</li>
              <li>Custom-ordered or personalized items</li>
              <li>Items damaged due to misuse or modification by the customer</li>
              <li>Items returned after the 7-day return period (unless defective)</li>
            </ul>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">4. How to Initiate a Return</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {[
                { step: '1', title: 'Request', desc: 'Go to Order History → select the order → click "Request Return"' },
                { step: '2', title: 'Review', desc: 'Our team will review your request within 2 business days' },
                { step: '3', title: 'Ship Back', desc: 'Once approved, ship the item back with the provided return label' },
                { step: '4', title: 'Refund', desc: 'Refund processed within 15 business days of receiving the return' },
              ].map((s, i) => (
                <div key={i} className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-center">
                  <div className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-bold">{s.step}</div>
                  <p className="text-sm font-medium text-gray-900">{s.title}</p>
                  <p className="text-xs text-gray-600 mt-1">{s.desc}</p>
                </div>
              ))}
            </div>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">5. Refund Methods & Timeline</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-3 border border-gray-200 font-medium">Payment Method</th>
                  <th className="text-left p-3 border border-gray-200 font-medium">Refund Method</th>
                  <th className="text-left p-3 border border-gray-200 font-medium">Timeline</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-3 border border-gray-200">Credit/Debit Card</td>
                  <td className="p-3 border border-gray-200">Reversed to original card</td>
                  <td className="p-3 border border-gray-200">5–15 business days</td>
                </tr>
                <tr>
                  <td className="p-3 border border-gray-200">GCash</td>
                  <td className="p-3 border border-gray-200">Refund to GCash wallet</td>
                  <td className="p-3 border border-gray-200">3–7 business days</td>
                </tr>
                <tr>
                  <td className="p-3 border border-gray-200">Bank Transfer</td>
                  <td className="p-3 border border-gray-200">Refund to bank account</td>
                  <td className="p-3 border border-gray-200">5–10 business days</td>
                </tr>
                <tr>
                  <td className="p-3 border border-gray-200">Cash on Delivery</td>
                  <td className="p-3 border border-gray-200">Bank transfer or store credit</td>
                  <td className="p-3 border border-gray-200">5–10 business days</td>
                </tr>
              </tbody>
            </table>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">6. Cancelled Orders</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Orders may be cancelled before the status changes to <strong>"Preparing"</strong></li>
              <li>Cancellations are processed immediately and refunded within 3–5 business days</li>
              <li>Orders already in "Preparing" or "Shipped" status cannot be cancelled but may be returned after delivery</li>
            </ul>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">7. Exchanges</h2>
            <p>
              We currently process exchanges as a return followed by a new order. To exchange an item, initiate a return
              request and place a new order for the desired item. If there is a price difference, it will be adjusted
              during the refund process.
            </p>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">8. Disputes</h2>
            <p>
              If you are unsatisfied with our resolution, you may escalate your concern to the{' '}
              <strong>DTI Fair Trade Enforcement Bureau</strong> or the appropriate government agency. Contact details:
            </p>
            <div className="bg-gray-50 rounded-xl p-4 text-sm border border-gray-100">
              <p><strong>DTI Consumer Care Hotline:</strong> 1-DTI (1-384)</p>
              <p><strong>Email:</strong> ConsumerCare@dti.gov.ph</p>
              <p><strong>Website:</strong> <a href="https://www.dti.gov.ph" target="_blank" rel="noopener noreferrer" className="text-orange-500">www.dti.gov.ph</a></p>
            </div>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">9. Contact Us</h2>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm space-y-1">
              <p><strong>10th West Moto Parts — Returns Department</strong></p>
              <p><strong>Email:</strong> <a href="mailto:returns@10thwestmoto.com" className="text-orange-500">returns@10thwestmoto.com</a></p>
              <p><strong>Phone:</strong> (02) 8888-1234</p>
              <p><strong>Hours:</strong> Monday – Saturday, 9:00 AM – 6:00 PM</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReturnPolicy;
