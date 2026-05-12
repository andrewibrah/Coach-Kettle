export default function AppStoreBadge() {
  return (
    <a
      href="https://apps.apple.com/us/app/coach-kettle/id6759267330"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Download Coach Kettle on the App Store"
      className="shimmer-hover group inline-flex items-center gap-3 rounded-full bg-white px-7 py-4 text-black no-underline transition-all duration-300 hover:bg-white/90 hover:shadow-[0_0_40px_rgba(255,255,255,0.12)] active:scale-[0.97]"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="black"
        xmlns="http://www.w3.org/2000/svg"
        className="transition-transform duration-300 group-hover:scale-110"
      >
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
      <span className="flex flex-col text-left leading-tight">
        <small className="text-[0.6rem] font-medium uppercase tracking-wider opacity-50">
          Download on the
        </small>
        <strong className="text-[0.88rem] font-semibold">App Store</strong>
      </span>
    </a>
  );
}
