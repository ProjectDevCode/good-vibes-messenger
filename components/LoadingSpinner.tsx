import React from 'react';

const LoadingSpinner = ({ message }: { message: string }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex flex-col justify-center items-center z-50">
      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white"></div>
      <p className="text-white text-xl mt-4">{message}</p>
    </div>
  );
};

export default LoadingSpinner;
