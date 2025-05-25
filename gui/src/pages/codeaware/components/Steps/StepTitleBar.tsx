import React from 'react';

interface StepTitleBarProps {
  title: string;
  isActive?: boolean; // Optional prop to indicate if the step is active
}

const StepTitleBar: React.FC<StepTitleBarProps> = ({ title, isActive = false }) => {
  return (
    <div
      className={`w-full px-4 py-2 flex items-center ${
        isActive ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'
      } text-gray-100 cursor-pointer transition-colors duration-150 ease-in-out`}
    >
      <span className="font-medium text-sm">{title}</span>
    </div>
  );
};

export default StepTitleBar;