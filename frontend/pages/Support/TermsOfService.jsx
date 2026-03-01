import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-orange-500 mb-6 transition-colors">
          <ArrowLeft size={16} /> Back to Home
        </Link>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <FileText size={20} className="text-orange-500" />
            </div>
            <div>
              <h1 className="font-display font-bold text-2xl text-gray-900">Terms of Service</h1>
              <p className="text-sm text-gray-500">Last updated: March 1, 2026</p>
            </div>
          </div>

          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed space-y-6">
            <p>
              Welcome to 10th West Moto Parts. These Terms of Service ("Terms") govern your access to and use of our
              website, products, and services. By using our platform, you agree to be bound by these Terms.
            </p>
            <p>
              This agreement is entered into between you ("Customer", "you") and <strong>10th West Moto Parts</strong>,
              a business registered under the DTI (Registration No. 3217456), operating from Quezon City, Metro Manila,
              Philippines, in compliance with the <strong>Consumer Act of the Philippines (RA 7394)</strong> and
              <strong> DTI Department Administrative Order No. 21-01</strong> (E-Commerce).
            </p>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">1. Eligibility</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>You must be at least <strong>18 years old</strong> to create an account and make purchases.</li>
              <li>By registering, you confirm that you are of legal age and that the information you provide is truthful.</li>
              <li>We reserve the right to refuse service to anyone who violates these Terms.</li>
            </ul>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">2. Account Registration</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>You must provide accurate personal information during registration.</li>
              <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
              <li>You agree to immediately notify us of any unauthorized use of your account.</li>
              <li>By registering, you consent to the collection and processing of your personal data in accordance with our <Link to="/privacy" className="text-orange-500">Privacy Policy</Link> and Republic Act No. 10173 (Data Privacy Act).</li>
            </ul>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">3. Products & Pricing</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>All prices are displayed in <strong>Philippine Pesos (₱)</strong> and are inclusive of applicable taxes unless stated otherwise.</li>
              <li>We make every effort to ensure product descriptions and prices are accurate but reserve the right to correct errors.</li>
              <li>Product availability is subject to change without prior notice.</li>
              <li>Images are for illustration purposes and may vary slightly from the actual product.</li>
              <li>All products sold come with applicable warranties under the <strong>Consumer Act (RA 7394)</strong>.</li>
            </ul>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">4. Orders & Payment</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Placing an order constitutes an offer to purchase. Acceptance occurs when we confirm your order.</li>
              <li>We accept the following payment methods: <strong>Credit/Debit Card (via Stripe), GCash, Bank Transfer, and Cash on Delivery (COD)</strong>.</li>
              <li>Orders may be cancelled before the status changes to "Preparing".</li>
              <li>We do not store credit or debit card numbers on our systems. All card payments are processed by our payment processor (Stripe) in compliance with PCI-DSS standards.</li>
              <li>All transactions are issued an official receipt or invoice per <strong>BIR Revenue Regulations No. 18-2012</strong>.</li>
            </ul>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">5. Shipping & Delivery</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Delivery times are estimates and may vary depending on location and courier availability.</li>
              <li>Shipping fees are calculated at checkout and are non-refundable unless the order is cancelled before shipment.</li>
              <li>Risk of loss passes to you upon delivery.</li>
              <li>You are responsible for providing an accurate delivery address. We are not liable for delays or losses caused by incorrect address information.</li>
            </ul>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">6. Returns & Refunds</h2>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm">
              <p className="font-medium text-gray-900 mb-2">DTI DAO 21-01 Compliance (7-Day Return Policy)</p>
              <ul className="list-disc pl-4 space-y-1 text-gray-700">
                <li>You may return products purchased online within <strong>7 calendar days</strong> from receipt of delivery, for any reason ("change of mind").</li>
                <li>Products must be unused, in original packaging, and in resalable condition.</li>
                <li>Defective products may be returned beyond the 7-day period, subject to manufacturer warranty terms.</li>
                <li>Refunds will be processed within <strong>15 business days</strong> of return approval.</li>
                <li>Refunds will be credited via the original payment method, or as store credit at your election.</li>
              </ul>
            </div>
            <p>
              For full details, see our <Link to="/return-policy" className="text-orange-500">Return & Refund Policy</Link>.
            </p>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">7. Warranty</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>All products carry the manufacturer's warranty as applicable.</li>
              <li>Warranty claims must include proof of purchase (order confirmation or official receipt).</li>
              <li>Consumable products (oil, lubricants, etc.) are not eligible for returns once opened.</li>
              <li>Your consumer rights under the <strong>Consumer Act (RA 7394)</strong> are not affected by these Terms.</li>
            </ul>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">8. Data Privacy</h2>
            <p>
              Your personal data is processed in accordance with our <Link to="/privacy" className="text-orange-500">Privacy Policy</Link> and
              Republic Act No. 10173 (Data Privacy Act of 2012). You have the right to access, correct, and delete your personal
              data at any time through your account settings or by contacting our Data Protection Officer
              at <a href="mailto:dpo@10thwestmoto.com" className="text-orange-500">dpo@10thwestmoto.com</a>.
            </p>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">9. Intellectual Property</h2>
            <p>
              All content on this website — including text, graphics, logos, images, and software — is the property of
              10th West Moto Parts or its content suppliers and is protected by Philippine intellectual property laws
              (RA 8293). Unauthorized use, reproduction, or distribution is prohibited.
            </p>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">10. Prohibited Activities</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the platform for illegal or unauthorized purposes</li>
              <li>Attempt to gain unauthorized access to our systems or other accounts</li>
              <li>Engage in fraudulent transactions or provide false information</li>
              <li>Scrape, crawl, or use automated tools to collect data from our platform</li>
              <li>Interfere with or disrupt the functionality of our website</li>
            </ul>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">11. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by Philippine law, 10th West Moto Parts shall not be liable for any
              indirect, incidental, special, or consequential damages arising from or related to your use of our
              services or products, except as required by the Consumer Act (RA 7394).
            </p>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">12. Dispute Resolution</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Any disputes shall first be settled through good faith negotiation.</li>
              <li>If unresolved, disputes may be filed with the <strong>DTI Fair Trade Enforcement Bureau</strong> or the appropriate court in Quezon City, Philippines.</li>
              <li>These Terms are governed by the laws of the Republic of the Philippines.</li>
              <li>Nothing in these Terms limits your rights under the Consumer Act (RA 7394) or DTI DAO 21-01.</li>
            </ul>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">13. Account Termination</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>You may delete your account at any time through your profile settings.</li>
              <li>We may suspend or terminate your account for violation of these Terms.</li>
              <li>Upon account deletion, your personal data will be anonymized in accordance with our Privacy Policy and RA 10173.</li>
              <li>Transaction records will be retained for 10 years as required by BIR regulations.</li>
            </ul>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">14. Modifications</h2>
            <p>
              We reserve the right to update or modify these Terms at any time. Material changes will be communicated via
              email or a notice on the website. Continued use of the platform after changes constitutes acceptance.
            </p>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">15. Contact Information</h2>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm space-y-1">
              <p><strong>10th West Moto Parts</strong></p>
              <p>Unit 10, West Avenue Commercial Center, Quezon City, Metro Manila 1104</p>
              <p><strong>Email:</strong> <a href="mailto:support@10thwestmoto.com" className="text-orange-500">support@10thwestmoto.com</a></p>
              <p><strong>Phone:</strong> (02) 8888-1234</p>
              <p><strong>DTI Registration No.:</strong> 3217456</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
