import React from 'react';

/** Presentation only: callers retain authoritative prices, shipping and payment state. */
const OrderSummary = ({ title = 'Order summary', children, className = '' }) => (
  <section className={`order-summary ${className}`} aria-label={title}>
    <h2>{title}</h2>
    {children}
  </section>
);

export default OrderSummary;
