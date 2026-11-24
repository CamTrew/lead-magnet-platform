import type { BrandSettings } from '@/lib/types';

const fullSizeClasses: Record<BrandSettings['logoSize'], string> = {
  small: 'h-8 max-w-[52px] sm:h-10',
  medium: 'h-12 max-w-[120px] sm:h-14 sm:max-w-[160px]',
  large: 'h-16 max-w-[200px] sm:h-20 sm:max-w-[260px]',
};

const compactSizeClasses: Record<BrandSettings['logoSize'], string> = {
  small: 'h-8 max-w-[52px]',
  medium: 'h-10 max-w-[96px]',
  large: 'h-12 max-w-[144px]',
};

export function BrandLogo({
  alt = '',
  compact = false,
  size,
  src,
}: {
  alt?: string;
  compact?: boolean;
  size: BrandSettings['logoSize'];
  src: string;
}) {
  const sizeClass = compact ? compactSizeClasses[size] : fullSizeClasses[size];

  // Brand uploads are validated server-side and displayed as content, never markup.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} className={`w-auto shrink-0 object-contain ${sizeClass}`} src={src} />;
}
