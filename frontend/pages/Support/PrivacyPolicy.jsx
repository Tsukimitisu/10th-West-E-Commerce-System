import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Mail } from 'lucide-react';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-orange-500 mb-6 transition-colors">
          <ArrowLeft size={16} /> Back to Home
        </Link>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <Shield size={20} className="text-orange-500" />
            </div>
            <div>
              <h1 className="font-display font-bold text-2xl text-gray-900">Privacy Policy</h1>
              <p className="text-sm text-gray-500">Last updated: March 1, 2026</p>
            </div>
          </div>

          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed space-y-6">
            <p>
              10th West Moto Parts ("we", "our", "us") is committed to protecting your personal data in compliance
              with Republic Act No. 10173, also known as the <strong>Data Privacy Act of 2012</strong>, its Implementing Rules
              and Regulations (IRR), and other applicable regulations of the National Privacy Commission (NPC).
            </p>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">1. Data Controller</h2>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm">
              <p><strong>Company:</strong> 10th West Moto Parts</p>
              <p><strong>Address:</strong> Unit 10, West Avenue Commercial Center, Quezon City, Metro Manila 1104, Philippines</p>
              <p><strong>DTI Registration No.:</strong> 3217456</p>
              <p><strong>BIR TIN:</strong> 123-456-789-000</p>
              <p><strong>Data Protection Officer (DPO):</strong> <a href="mailto:dpo@10thwestmoto.com" className="text-orange-500">dpo@10thwestmoto.com</a></p>
              <p><strong>NPC Registration No.:</strong> PIC-001-2025-0001</p>
            </div>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">2. Personal Data We Collect</h2>
            <p>We collect the following categories of personal information:</p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50"><th className="text-left p-3 border border-gray-200 font-medium">Data Type</th><th className="text-left p-3 border border-gray-200 font-medium">Purpose</th></tr>
              </thead>
              <tbody>
                <tr><td className="p-3 border border-gray-200">Full name</td><td className="p-3 border border-gray-200">Account management, order fulfillment</td></tr>
                <tr><td className="p-3 border border-gray-200">Email address</td><td className="p-3 border border-gray-200">Account verification, communications, order updates</td></tr>
                <tr><td className="p-3 border border-gray-200">Phone number</td><td className="p-3 border border-gray-200">Order updates, delivery coordination</td></tr>
                <tr><td className="p-3 border border-gray-200">Shipping address</td><td className="p-3 border border-gray-200">Delivery of products</td></tr>
                <tr><td className="p-3 border border-gray-200">Payment method (type only)</td><td className="p-3 border border-gray-200">Transaction processing (we do NOT store card numbers)</td></tr>
                <tr><td className="p-3 border border-gray-200">Order history</td><td className="p-3 border border-gray-200">Customer service, returns processing</td></tr>
                <tr><td className="p-3 border border-gray-200">Device info, IP address</td><td className="p-3 border border-gray-200">Security, fraud prevention, analytics</td></tr>
                <tr><td className="p-3 border border-gray-200">Cookies</td><td className="p-3 border border-gray-200">Site functionality, preferences, analytics</td></tr>
              </tbody>
            </table>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">3. Legal Basis for Processing</h2>
            <p>We process your personal data based on the following legal grounds under RA 10173:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Consent (§12a):</strong> When you create an account, you provide explicit consent for data processing.</li>
              <li><strong>Contractual necessity (§12b):</strong> Processing necessary to fulfill orders and provide services.</li>
              <li><strong>Legitimate interest (§12f):</strong> Fraud prevention, security monitoring, and service improvements.</li>
              <li><strong>Legal obligation (§12c):</strong> Tax record retention per BIR regulations.</li>
            </ul>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">4. Data Retention</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50"><th className="text-left p-3 border border-gray-200 font-medium">Data</th><th className="text-left p-3 border border-gray-200 font-medium">Retention Period</th></tr>
              </thead>
              <tbody>
                <tr><td className="p-3 border border-gray-200">Account data (name, email, phone)</td><td className="p-3 border border-gray-200">Active account + 2 years after deletion</td></tr>
                <tr><td className="p-3 border border-gray-200">Transaction records & invoices</td><td className="p-3 border border-gray-200">10 years (BIR requirement)</td></tr>
                <tr><td className="p-3 border border-gray-200">Activity logs</td><td className="p-3 border border-gray-200">5 years</td></tr>
                <tr><td className="p-3 border border-gray-200">Cookies</td><td className="p-3 border border-gray-200">Session or up to 1 year</td></tr>
              </tbody>
            </table>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">5. Third-Party Sharing</h2>
            <p>We may share your data with the following, strictly for the stated purposes:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Payment processors</strong> (Stripe, GCash, Maya) — to process payments</li>
              <li><strong>Shipping couriers</strong> (J&T, LBC, Grab) — to deliver your orders</li>
              <li><strong>Cloud infrastructure</strong> (Supabase/AWS) — to host and secure data</li>
            </ul>
            <p className="font-medium text-gray-900">We never sell, rent, or trade your personal data to any third party for marketing purposes.</p>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">6. Your Rights (RA 10173 §§16–18)</h2>
            <p>As a data subject, you have the following rights:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { title: 'Right to Access', desc: 'Request a copy of your personal data we hold.' },
                { title: 'Right to Rectification', desc: 'Correct any inaccurate or incomplete data.' },
                { title: 'Right to Erasure', desc: 'Request deletion of your account and personal data ("Right to be Forgotten").' },
                { title: 'Right to Data Portability', desc: 'Receive your data in a structured, commonly used format.' },
                { title: 'Right to Object', desc: 'Object to certain types of data processing, including direct marketing.' },
                { title: 'Right to Lodge a Complaint', desc: 'File a complaint with the National Privacy Commission.' },
              ].map((r, i) => (
                <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <p className="text-sm font-medium text-gray-900">{r.title}</p>
                  <p className="text-xs text-gray-600">{r.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-sm">
              To exercise any of these rights, contact our Data Protection Officer at{' '}
              <a href="mailto:dpo@10thwestmoto.com" className="text-orange-500 font-medium">dpo@10thwestmoto.com</a> or
              use the "Delete My Account" option in your profile settings.
            </p>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">7. Data Security</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Passwords are hashed using industry-standard bcrypt encryption</li>
              <li>Two-factor authentication (2FA) is available for all accounts</li>
              <li>All data is transmitted over encrypted HTTPS connections</li>
              <li>Role-based access controls limit internal data access</li>
              <li>Activity logging monitors for suspicious access patterns</li>
            </ul>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">8. Data Breach Notification</h2>
            <p>
              In the event of a personal data breach, we will notify the National Privacy Commission (NPC) within
              72 hours of discovery, and affected data subjects within a reasonable time, as required by NPC Circular 16-03.
            </p>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">9. Cookies</h2>
            <p>
              Our website uses essential cookies for authentication and site functionality. We also use analytics cookies
              to understand how you use our site. You can manage your cookie preferences via the cookie consent banner
              shown on your first visit. Essential cookies cannot be disabled as they are necessary for the site to function.
            </p>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">10. Children's Privacy</h2>
            <p>
              Our services are not directed to individuals under 18 years of age. We do not knowingly collect personal
              data from minors. Users must confirm they are at least 18 years old during registration. If we discover
              we have collected data from a minor without proper consent, we will delete it promptly per RA 10173 §3(c).
            </p>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any material changes by email
              or via a prominent notice on our website. The "Last updated" date at the top indicates when this policy
              was last revised. Continued use of our services after changes constitute acceptance of the updated policy.
            </p>

            <h2 className="font-display font-semibold text-lg text-gray-900 mt-8">12. Contact & Complaints</h2>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-2 text-sm">
              <p><strong>Data Protection Officer:</strong> <a href="mailto:dpo@10thwestmoto.com" className="text-orange-500">dpo@10thwestmoto.com</a></p>
              <p><strong>General Support:</strong> <a href="mailto:support@10thwestmoto.com" className="text-orange-500">support@10thwestmoto.com</a></p>
              <p><strong>Phone:</strong> (02) 8888-1234</p>
              <p className="pt-2 border-t border-orange-200 text-orange-700">
                You may also file a complaint with the <strong>National Privacy Commission (NPC)</strong> at{' '}
                <a href="https://www.privacy.gov.ph" target="_blank" rel="noopener noreferrer" className="text-orange-500 underline">www.privacy.gov.ph</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
