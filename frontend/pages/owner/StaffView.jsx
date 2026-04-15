import React from 'react';
import StaffManagement from '../../components/owner/StaffManagement';

const StaffView = () => {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display font-bold text-xl text-white">Staff Management</h1>
        <p className="text-sm text-gray-400">Manage staff members, roles, and permissions</p>
      </div>
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
        <StaffManagement />
      </div>
    </div>
  );
};

export default StaffView;


