import React from 'react';
import '../styles/AnimatedBackground.css';

// Gooey blob animation inspired by CodePen, using brand colors
const AnimatedBackground: React.FC = () => {
  return (
    <div className="animated-background">
      <svg
        id="animated-loader"
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 800 800"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Gooey filter effect */}
          <filter id="goo">
            {/* <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="20" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="goo"
            />
            <feBlend in2="goo" in="SourceGraphic" result="mix" /> */}
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" />
          </filter>
          
          {/* Brand color gradient */}
          <linearGradient id="brandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(var(--DarkRGBA))" />
            <stop offset="50%" stopColor="rgb(var(--MainRGBA))" />
            <stop offset="70%" stopColor="rgb(var(--LightRGBA))" />
          </linearGradient>
        </defs>
        
        {/* Mask for the blobs */}
        <mask id="blobMask">
          <g className="blobs">
            <path className="blob blob-1" cx="150" cy="150" r="90" fill="white" />
            <circle className="blob blob-2" cx="650" cy="200" r="140" fill="white" />
            <circle className="blob blob-3" cx="100" cy="600" r="110" fill="white" />
            <circle className="blob blob-4" cx="400" cy="400" r="160" fill="white" />
            <circle className="blob blob-5" cx="700" cy="650" r="75" fill="white" />
            <circle className="blob blob-6" cx="300" cy="150" r="60" fill="white" />
            <circle className="blob blob-7" cx="600" cy="500" r="100" fill="white" />
          </g>
        </mask>
        
        {/* Main rectangle with gradient and mask */}
        <rect
          x="0"
          y="0"
          width="800"
          height="800"
          mask="url(#blobMask)"
          fill="url(#brandGradient)"
          filter="url(#softBlur)"
        />
      </svg>
    </div>
  );
};

export default AnimatedBackground;
