export const returnLabels = {
  pending: 'Under review', approved: 'Approved — return item to shop', received: 'Item received',
  refund_processing: 'Refund processing', refunded: 'Refunded', rejected: 'Rejected', manual_review: 'Requires review',
};
export const returnSteps = ['pending', 'approved', 'received', 'refund_processing', 'refunded'];
export function returnProgress(status) {
  if (status === 'rejected') return ['Request submitted', 'Under review', 'Rejected'];
  // Older recovery records may predate physical-receipt enforcement.
  if (status === 'manual_review') return ['Request submitted', 'Under review', 'Requires review'];
  const index = returnSteps.indexOf(status);
  return ['Request submitted', ...returnSteps.slice(0, Math.max(0, index + 1)).map(step => returnLabels[step])];
}
