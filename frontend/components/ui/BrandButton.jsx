import React from 'react';
import { Link } from 'react-router-dom';

const styles = {
  primary: 'border-transparent bg-gradient-to-r from-[#e53935] to-[#f97316] text-white shadow-[0_10px_24px_rgba(229,57,53,0.24)] hover:shadow-[0_14px_30px_rgba(229,57,53,0.32)]',
  secondary: 'border-slate-300 bg-white text-slate-900 hover:border-slate-400 hover:bg-slate-50',
  dark: 'border-white/20 bg-white/10 text-white hover:bg-white/16',
  danger: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
};

const BrandButton = ({
  as: Element = 'button',
  to,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}) => {
  const sizeClass = size === 'sm' ? 'min-h-10 px-4 py-2 text-sm' : size === 'lg' ? 'min-h-12 px-6 py-3 text-base' : 'min-h-11 px-5 py-2.5 text-sm';
  const classes = `inline-flex items-center justify-center gap-2 rounded-xl border font-semibold transition-all duration-200 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ${sizeClass} ${styles[variant] || styles.primary} ${className}`;

  if (to) {
    return <Link to={to} className={classes} {...props}>{children}</Link>;
  }

  return <Element className={classes} {...props}>{children}</Element>;
};

export default BrandButton;
