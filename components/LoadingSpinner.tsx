
import React from 'react';

const LoadingSpinner: React.FC = () => {
  return (
    <div className="relative h-16 w-16 mx-auto">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="6"
        />
      </svg>
      <svg className="absolute inset-0 h-full w-full animate-spin" style={{ animationDuration: '1.5s' }} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="6"
          strokeDasharray="141.37"
          strokeDashoffset="70.685"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

export default LoadingSpinner;