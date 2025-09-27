import type React from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'dotlottie-player': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        autoplay?: boolean;
        loop?: boolean;
        src?: string;
        background?: string;
        speed?: number;
      };
    }
  }
}

export {};
