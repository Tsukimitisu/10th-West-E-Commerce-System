import React from 'react';
import { ShoppingBag, Package, Truck, Check, Ban } from 'lucide-react';
import { OrderStatus } from '../types';

interface OrderTrackerProps {
  status: OrderStatus;
}

const OrderTracker: React.FC<OrderTrackerProps> = ({ status }) => {
  const steps = [
    { id: 'placed', name: 'Order Placed', icon: ShoppingBag, status: OrderStatus.PENDING },
    { id: 'processing', name: 'Processing', icon: Package, status: OrderStatus.PAID },
    { id: 'shipped', name: 'Shipped', icon: Truck, status: OrderStatus.SHIPPED },
    { id: 'delivered', name: 'Delivered', icon: Check, status: OrderStatus.COMPLETED },
  ];

  const getCurrentStep = (s: OrderStatus) => {
    if (s === OrderStatus.PENDING) return 0;
    if (s === OrderStatus.PAID) return 1;
    if (s === OrderStatus.SHIPPED) return 2;
    if (s === OrderStatus.COMPLETED) return 3;
    return -1; // cancelled
  };

  const currentStep = getCurrentStep(status);

  if (status === OrderStatus.CANCELLED) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="flex items-center gap-3 bg-red-50 text-red-700 px-6 py-3 rounded-xl">
          <Ban className="w-5 h-5" />
          <span className="text-sm font-bold">This order has been cancelled</span>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      {/* Desktop Tracker */}
      <div className="hidden sm:block">
        <div className="relative">
          {/* Background track */}
          <div className="absolute top-5 left-0 right-0 mx-[60px] h-1 bg-gray-200 rounded-full" />
          {/* Filled track */}
          <div
            className="absolute top-5 left-0 mx-[60px] h-1 bg-gradient-to-r from-orange-500 to-green-500 rounded-full transition-all duration-700"
            style={{ width: `${(currentStep / (steps.length - 1)) * (100 - 10)}%` }}
          />

          <div className="relative flex justify-between">
            {steps.map((step, idx) => {
              const isCompleted = idx <= currentStep;
              const isCurrent = idx === currentStep;
              return (
                <div key={step.id} className="flex flex-col items-center z-10" style={{ width: '120px' }}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isCompleted
                      ? isCurrent
                        ? 'bg-orange-600 ring-4 ring-orange-200 shadow-lg'
                        : 'bg-green-500'
                      : 'bg-gray-200'
                  }`}>
                    <step.icon className={`w-5 h-5 ${isCompleted ? 'text-white' : 'text-gray-400'}`} />
                  </div>
                  <span className={`mt-3 text-xs font-bold text-center leading-tight ${
                    isCompleted ? (isCurrent ? 'text-orange-600' : 'text-green-600') : 'text-gray-400'
                  }`}>
                    {step.name}
                  </span>
                  {isCurrent && (
                    <span className="mt-1 text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Current</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile Tracker (vertical) */}
      <div className="sm:hidden space-y-0">
        {steps.map((step, idx) => {
          const isCompleted = idx <= currentStep;
          const isCurrent = idx === currentStep;
          const isLast = idx === steps.length - 1;
          return (
            <div key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isCompleted ? (isCurrent ? 'bg-orange-600 ring-2 ring-orange-200' : 'bg-green-500') : 'bg-gray-200'
                }`}>
                  <step.icon className={`w-4 h-4 ${isCompleted ? 'text-white' : 'text-gray-400'}`} />
                </div>
                {!isLast && (
                  <div className={`w-0.5 h-8 ${idx < currentStep ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </div>
              <div className="pb-6">
                <p className={`text-sm font-bold ${isCompleted ? (isCurrent ? 'text-orange-600' : 'text-green-600') : 'text-gray-400'}`}>
                  {step.name}
                </p>
                {isCurrent && (
                  <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Current</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OrderTracker;
