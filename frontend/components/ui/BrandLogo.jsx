import React from 'react';
import { Link } from 'react-router-dom';

/** Always render the complete official asset without cropping or recoloring. */
const BrandLogo = ({ compact = false, dark = false, link = true, className = '', ...props }) => {
  const content = <>
    <span className="brand-logo-plate">
      <img src="/brand/10th-west-logo.png" alt="10th West Motorcycle Parts & Accessories" width="1230" height="1278" decoding="async" className="brand-logo-image" />
    </span>
    {!compact && <span className="brand-logo-name" aria-hidden="true">
      <span className="brand-logo-title">10TH WEST</span>
      <span className="brand-logo-description">MOTORCYCLE PARTS & ACCESSORIES</span>
    </span>}
  </>;
  const classes = `brand-logo ${dark ? 'brand-logo-dark' : ''} ${compact ? 'brand-logo-compact' : ''} ${className}`;
  return link
    ? <Link to="/" className={classes} aria-label="10th West Moto home" {...props}>{content}</Link>
    : <span className={classes} {...props}>{content}</span>;
};

export default BrandLogo;
