import React from 'react';
import StaffManagement from '../../components/StaffManagement';

const StaffView = () => {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display font-bold text-xl text-gray-900">Staff Management</h1>
        <p className="text-sm text-gray-500">Manage staff members, roles, and permissions</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <StaffManagement />
      </div>
    </div>
  );
};

export default StaffView;
