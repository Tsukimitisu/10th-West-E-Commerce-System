import React from 'react';
import StaffManagement from '../../components/owner/StaffManagement';

const StaffView = () => {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display font-bold text-xl text-white">Staff Management</h1>
        <p className="text-sm text-gray-400">Manage staff members, roles, and permissions</p>
      </div>
      <div className="rounded-xl p-0">
        <StaffManagement />
      </div>
    </div>
  );
};

export default StaffView;


