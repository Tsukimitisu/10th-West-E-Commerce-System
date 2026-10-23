import React from 'react';
import { Check, CheckCheck, CircleAlert, Clock3, RefreshCw } from 'lucide-react';
import { getMessageDeliveryStatus } from '../../utils/chatMessages.js';

const STATUS_CONTENT = {
  sending: { label: 'Sending…', Icon: Clock3 },
  sent: { label: 'Sent', Icon: Check },
  delivered: { label: 'Delivered', Icon: CheckCheck },
  read: { label: 'Seen', Icon: CheckCheck },
  failed: { label: 'Failed to send', Icon: CircleAlert },
};

const MessageDeliveryStatus = ({ message, onRetry }) => {
  const status = getMessageDeliveryStatus(message);
  const { label, Icon } = STATUS_CONTENT[status] || STATUS_CONTENT.sent;

  if (status === 'failed' && onRetry) {
    return (
      <button type="button" onClick={() => onRetry(message)} className="inline-flex min-h-6 items-center gap-1 rounded px-1 text-[11px] font-semibold text-red-100 hover:bg-white/10" aria-label="Retry failed message">
        <CircleAlert size={12} /> {label} <RefreshCw size={11} /> Retry
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" aria-label={`Message status: ${label}`}>
      <Icon size={12} /> {label}
    </span>
  );
};

export default MessageDeliveryStatus;
