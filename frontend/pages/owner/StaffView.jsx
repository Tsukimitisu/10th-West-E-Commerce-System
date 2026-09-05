import React from 'react';
import StaffManagement from '../../components/owner/StaffManagement';
import PageHeader from '../../components/operations/PageHeader';

const StaffView = () => {
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Access management" title="Staff & roles" description="Manage operational accounts, responsibilities, and permission boundaries." />
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
        <StaffManagement />
      </div>
    </div>
  );
};

export default StaffView;


