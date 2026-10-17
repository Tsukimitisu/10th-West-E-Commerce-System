import React from 'react';
import OperationsAccountView from '../../components/operations/OperationsAccountView';

// Keep the frozen Staff presentation while sharing the established account logic.
export default function StaffAccountView({ user }) {
  return <OperationsAccountView user={user} />;
}
