import pool from '../config/database.js';

const seedData = async () => {
  const client = await pool.connect();

  try {
    console.log('🌱 Starting data seeding...');

    // Seed FAQs
    const faqs = [
      {
        question: 'What is your return policy?',
        answer: 'We accept returns within 30 days of purchase for most items. Items must be in original condition with all packaging. Certain items like custom orders or electrical components may not be eligible for return.',
        display_order: 1
      },
      {
        question: 'How long does shipping take?',
        answer: 'Standard shipping typically takes 3-5 business days. Expedited shipping options are available at checkout. Once your order ships, you will receive a tracking number via email.',
        display_order: 2
      },
      {
        question: 'Do you ship internationally?',
        answer: 'Currently, we only ship within the United States. We are working on expanding our shipping options to include international destinations in the future.',
        display_order: 3
      },
      {
        question: 'How can I track my order?',
        answer: 'You can track your order by logging into your account and viewing your order history. Once shipped, a tracking number will be provided that you can use with the carrier.',
        display_order: 4
      },
      {
        question: 'What payment methods do you accept?',
        answer: 'We accept all major credit cards (Visa, MasterCard, American Express, Discover), PayPal, and store credit. For in-store purchases, we also accept cash.',
        display_order: 5
      },
      {
        question: 'Can I cancel or modify my order?',
        answer: 'Orders can be cancelled or modified within 1 hour of placement. After that, the order enters our fulfillment process and cannot be changed. Please contact support immediately if you need assistance.',
        display_order: 6
      },
      {
        question: 'Do you offer warranties on parts?',
        answer: 'Most parts come with manufacturer warranties ranging from 90 days to 1 year. Specific warranty information is available on each product page. We also offer extended warranty protection for select items.',
        display_order: 7
      },
      {
        question: 'How do I know if a part fits my motorcycle?',
        answer: 'Each product page includes compatibility information. You can also use our "Check Compatibility" tool or contact our support team with your motorcycle make, model, and year for assistance.',
        display_order: 8
      }
    ];

    for (const faq of faqs) {
      await client.query(
        `INSERT INTO faqs (question, answer, display_order, is_active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT DO NOTHING`,
        [faq.question, faq.answer, faq.display_order]
      );
    }
    console.log(`✅ Seeded ${faqs.length} FAQs`);

    // Seed Policies
    const policies = [
      {
        type: 'return_policy',
        title: 'Return & Exchange Policy',
        content: `
          <h2>Return Policy</h2>
          <p>At 10th West Moto, we want you to be completely satisfied with your purchase. If you're not happy with your order, we're here to help.</p>
          
          <h3>Return Window</h3>
          <p>You have 30 days from the date of delivery to return most items for a refund or exchange.</p>
          
          <h3>Eligibility</h3>
          <ul>
            <li>Items must be in original condition</li>
            <li>Original packaging must be included</li>
            <li>All accessories and documentation must be included</li>
            <li>Items must be unused and show no signs of installation</li>
          </ul>
          
          <h3>Non-Returnable Items</h3>
          <ul>
            <li>Custom or special order items</li>
            <li>Electrical components that have been installed</li>
            <li>Items marked as final sale</li>
            <li>Gift cards</li>
          </ul>
          
          <h3>How to Return</h3>
          <ol>
            <li>Log into your account and go to Order History</li>
            <li>Select the order and click "Request Return"</li>
            <li>Choose items and provide reason</li>
            <li>Wait for return approval (usually within 24 hours)</li>
            <li>Ship items back using provided return label</li>
          </ol>
          
          <h3>Refunds</h3>
          <p>Once we receive and inspect your return, we will process your refund within 5-7 business days. Refunds will be issued to your original payment method. You can also choose to receive store credit instead.</p>
          
          <h3>Exchanges</h3>
          <p>If you need a different size, color, or item, we're happy to help with an exchange. Follow the return process and place a new order for the replacement item.</p>
          
          <h3>In-Store Returns</h3>
          <p>You can return items purchased online at any of our retail locations. Bring your order receipt and the items in original condition.</p>
          
          <h3>Questions?</h3>
          <p>Contact our customer service team at support@10thwestmoto.com or call us at 1-800-MOTO-123.</p>
        `
      },
      {
        type: 'shipping_policy',
        title: 'Shipping Policy',
        content: `
          <h2>Shipping Information</h2>
          
          <h3>Shipping Methods</h3>
          <ul>
            <li><strong>Standard Shipping:</strong> 3-5 business days</li>
            <li><strong>Expedited Shipping:</strong> 2-3 business days</li>
            <li><strong>Overnight Shipping:</strong> Next business day</li>
          </ul>
          
          <h3>Shipping Costs</h3>
          <p>Shipping costs are calculated at checkout based on the weight, size, and destination of your order. Free standard shipping is available on orders over $100.</p>
          
          <h3>Processing Time</h3>
          <p>Orders are typically processed within 1-2 business days. Orders placed on weekends or holidays will be processed the next business day.</p>
          
          <h3>Tracking</h3>
          <p>Once your order ships, you will receive a confirmation email with tracking information. You can also track your order through your account dashboard.</p>
          
          <h3>International Shipping</h3>
          <p>We currently only ship within the United States. International shipping options are coming soon.</p>
          
          <h3>Delivery Issues</h3>
          <p>If your package is lost or damaged during shipping, please contact us immediately. We will work with the carrier to resolve the issue and ensure you receive your order.</p>
        `
      },
      {
        type: 'privacy_policy',
        title: 'Privacy Policy',
        content: `
          <h2>Privacy Policy</h2>
          <p><em>Last Updated: February 2026</em></p>
          
          <h3>Information We Collect</h3>
          <p>We collect information you provide directly to us, including:</p>
          <ul>
            <li>Name, email address, phone number</li>
            <li>Shipping and billing addresses</li>
            <li>Payment information (securely processed by Stripe)</li>
            <li>Order history and preferences</li>
          </ul>
          
          <h3>How We Use Your Information</h3>
          <ul>
            <li>Process and fulfill your orders</li>
            <li>Send order confirmations and updates</li>
            <li>Provide customer support</li>
            <li>Send marketing communications (with your consent)</li>
            <li>Improve our products and services</li>
          </ul>
          
          <h3>Information Sharing</h3>
          <p>We do not sell or rent your personal information to third parties. We may share information with:</p>
          <ul>
            <li>Service providers who help us operate our business</li>
            <li>Shipping carriers to deliver your orders</li>
            <li>Payment processors to handle transactions</li>
          </ul>
          
          <h3>Data Security</h3>
          <p>We implement appropriate security measures to protect your personal information. All payment information is encrypted and processed through secure channels.</p>
          
          <h3>Your Rights</h3>
          <p>You have the right to:</p>
          <ul>
            <li>Access and update your personal information</li>
            <li>Request deletion of your data</li>
            <li>Opt out of marketing communications</li>
            <li>Disable cookies in your browser</li>
          </ul>
          
          <h3>Contact Us</h3>
          <p>If you have questions about this privacy policy, please contact us at privacy@10thwestmoto.com</p>
        `
      },
      {
        type: 'terms_of_service',
        title: 'Terms of Service',
        content: `
          <h2>Terms of Service</h2>
          
          <h3>Acceptance of Terms</h3>
          <p>By accessing and using 10th West Moto's website and services, you agree to be bound by these Terms of Service.</p>
          
          <h3>Use of Service</h3>
          <p>You must be 18 years or older to make purchases on our website. You agree to provide accurate information and keep your account secure.</p>
          
          <h3>Product Information</h3>
          <p>We strive to display accurate product information, but we cannot guarantee that all descriptions, images, and specifications are error-free. Prices are subject to change without notice.</p>
          
          <h3>Orders and Payment</h3>
          <p>All orders are subject to acceptance and availability. We reserve the right to refuse or cancel any order. Payment must be received before orders are shipped.</p>
          
          <h3>Intellectual Property</h3>
          <p>All content on this website, including text, images, logos, and software, is the property of 10th West Moto and is protected by copyright and trademark laws.</p>
          
          <h3>Limitation of Liability</h3>
          <p>10th West Moto is not liable for any indirect, incidental, or consequential damages arising from the use of our products or services.</p>
          
          <h3>Governing Law</h3>
          <p>These terms are governed by the laws of the United States and the state in which our business is registered.</p>
          
          <h3>Changes to Terms</h3>
          <p>We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting to the website.</p>
        `
      }
    ];

    for (const policy of policies) {
      await client.query(
        `INSERT INTO policies (type, title, content)
         VALUES ($1, $2, $3)
         ON CONFLICT (type)
         DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content`,
        [policy.type, policy.title, policy.content]
      );
    }
    console.log(`✅ Seeded ${policies.length} policies`);

    console.log('🎉 Data seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run seeding
seedData()
  .then(() => {
    console.log('✨ All done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
