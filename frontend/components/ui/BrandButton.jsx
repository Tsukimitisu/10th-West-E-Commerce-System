import React from 'react';
import { Link } from 'react-router-dom';

const styles = {
  primary: 'brand-button-primary border-transparent',
  secondary: 'border-slate-300 bg-white text-slate-900 hover:border-slate-400 hover:bg-slate-50',
  dark: 'border-white/25 bg-white/10 text-white hover:bg-white/15',
  danger: 'brand-button-danger border-transparent',
  ghost: 'border-transparent bg-transparent text-slate-700 hover:bg-slate-100',
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
  const sizeClass = size === 'sm' ? 'min-h-11 px-4 py-2 text-sm' : size === 'lg' ? 'min-h-12 px-6 py-3 text-base' : 'min-h-11 px-5 py-2.5 text-sm';
  const classes = `brand-button inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition-[background-color,border-color,color,transform] duration-200 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ${sizeClass} ${styles[variant] || styles.primary} ${className}`;

  if (to) {
    return <Link to={to} className={classes} {...props}>{children}</Link>;
  }

  return <Element type={Element === 'button' ? 'button' : undefined} className={classes} {...props}>{children}</Element>;
};

export default BrandButton;
