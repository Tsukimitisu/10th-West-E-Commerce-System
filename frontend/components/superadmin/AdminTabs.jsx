import React, { useId, useRef } from 'react';

export default function AdminTabs({ label, items, value, onChange, children }) {
  const prefix = useId();
  const tabs = useRef([]);
  const active = Math.max(0, items.findIndex(item => item.id === value));
  const handleKey = (event, index) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = items.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    onChange(items[next].id);
    tabs.current[next]?.focus();
    tabs.current[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  return <>
    <div className="sa-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => {
        const Icon = item.icon;
        return <button key={item.id} ref={el => { tabs.current[index] = el; }} type="button" role="tab" id={`${prefix}-tab-${item.id}`} aria-controls={`${prefix}-panel`} aria-selected={index === active} tabIndex={index === active ? 0 : -1} onKeyDown={event => handleKey(event, index)} onClick={() => onChange(item.id)}><Icon size={16} aria-hidden="true" />{item.label}</button>;
      })}
    </div>
    <div role="tabpanel" id={`${prefix}-panel`} aria-labelledby={`${prefix}-tab-${items[active].id}`} tabIndex={0} className="space-y-5">{children}</div>
  </>;
}
