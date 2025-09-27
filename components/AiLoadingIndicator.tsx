import React from 'react';

const DEFAULT_SIZE = 64;

interface AiLoadingIndicatorProps {
  size?: number;
  className?: string;
  ariaLabel?: string;
}

const isBrowser = typeof window !== 'undefined';

export const AiLoadingIndicator: React.FC<AiLoadingIndicatorProps> = ({
  size = DEFAULT_SIZE,
  className,
  ariaLabel = 'Loading animation',
}) => {
  const dimension = `${size}px`;

  if (!isBrowser) {
    return (
      <div
        className={`inline-flex items-center justify-center ${className ?? ''}`}
        style={{ width: dimension, height: dimension }}
        aria-label={ariaLabel}
      >
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center ${className ?? ''}`}
      style={{ width: dimension, height: dimension }}
      aria-label={ariaLabel}
      role="img"
    >
      <dotlottie-player
        autoplay
        loop
        src="/animations/ai-loading-model.lottie"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default AiLoadingIndicator;
