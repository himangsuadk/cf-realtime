interface LogoProps {
  size?: number;
  className?: string;
}

export default function Logo({ size = 40, className = '' }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-label="CloudMeet logo"
    >
      <defs>
        <linearGradient id="logoBg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ff8c00" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
        <linearGradient id="logoRing" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Background rounded square */}
      <rect width="48" height="48" rx="13" fill="url(#logoBg)" />
      {/* Subtle inner ring */}
      <rect width="48" height="48" rx="13" fill="none" stroke="url(#logoRing)" strokeWidth="1.5" />
      {/* Camera body */}
      <rect x="7" y="15" width="22" height="17" rx="4" fill="white" />
      {/* Camera lens flap */}
      <path d="M31 19.5 L41 14.5 L41 33.5 L31 28.5 Z" fill="white" />
      {/* Lens outer ring */}
      <circle cx="18" cy="23.5" r="4.5" fill="url(#logoBg)" />
      {/* Lens inner highlight */}
      <circle cx="18" cy="23.5" r="2.2" fill="white" />
    </svg>
  );
}
