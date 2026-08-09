export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="云签 YunQian"
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  );
}
