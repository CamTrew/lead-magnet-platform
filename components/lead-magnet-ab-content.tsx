'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react';
import { getLeadMagnetAbVariantId } from '@/lib/lead-magnet-analytics-client';
import { leadMagnetDisplayImageUrl, leadMagnetImageSrcSet } from '@/lib/lead-magnet-images';
import type { LeadMagnet } from '@/lib/types';

function useActiveVariant(magnet: LeadMagnet) {
  const [variantId, setVariantId] = useState('control');
  useEffect(() => {
    setVariantId(getLeadMagnetAbVariantId(
      magnet.id,
      magnet.abTestEnabled ? magnet.abTestVariants.map((variant) => variant.id) : []
    ));
  }, [magnet.abTestEnabled, magnet.abTestVariants, magnet.id]);
  return magnet.abTestVariants.find((variant) => variant.id === variantId);
}

export function LeadMagnetAbText({
  className,
  control,
  field,
  magnet,
  tag = 'p',
}: {
  className: string;
  control: string;
  field: 'title' | 'subtitle';
  magnet: LeadMagnet;
  tag?: 'h1' | 'p';
}) {
  const active = useActiveVariant(magnet);
  const value = active?.[field]?.trim() || control;
  if (!value) return null;
  return tag === 'h1'
    ? <h1 className={className}>{value}</h1>
    : <p className={className}>{value}</p>;
}

export function LeadMagnetAbImage({
  className,
  imageClassName,
  magnet,
  sizes,
}: {
  className: string;
  imageClassName: string;
  magnet: LeadMagnet;
  sizes: string;
}) {
  const active = useActiveVariant(magnet);
  const source = active?.imageUrl?.trim() || magnet.imageUrl;
  if (!source) return null;
  const imageUrl = leadMagnetDisplayImageUrl({ id: magnet.id, imageUrl: source, updatedAt: magnet.updatedAt });
  return (
    <div className={className} style={{ backgroundImage: 'linear-gradient(135deg, #f3f6fb 0%, #ffffff 55%, #eef4fb 100%)' }}>
      <div className="relative aspect-[16/10] w-full">
        <img
          alt={active?.title?.trim() || magnet.title}
          className={imageClassName}
          decoding="async"
          fetchPriority="high"
          height={750}
          loading="eager"
          sizes={sizes}
          src={imageUrl}
          srcSet={leadMagnetImageSrcSet(source)}
          width={1200}
        />
      </div>
    </div>
  );
}
