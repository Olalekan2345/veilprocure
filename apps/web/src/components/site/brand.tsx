import Image from "next/image";

/**
 * The approved VeilProcure logo: the VP monogram with lock and the original "VeilProcure"
 * lettering, both cut from the owner-supplied artwork (public/brand) — never redrawn.
 * The navy artwork is for light surfaces only.
 */
export function BrandLockup({ height = 34, className = "" }: { height?: number; className?: string }) {
  const markWidth = Math.round((289 / 192) * height);
  const wordHeight = Math.round(height * 0.5);
  const wordWidth = Math.round((564 / 96) * wordHeight);
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image src="/brand/vp-mark-green.png" alt="" width={markWidth} height={height} priority />
      <Image src="/brand/vp-wordmark-green.png" alt="VeilProcure" width={wordWidth} height={wordHeight} priority />
    </span>
  );
}

export function BrandMark({ height = 32 }: { height?: number }) {
  return <Image src="/brand/vp-mark-green.png" alt="" width={Math.round((289 / 192) * height)} height={height} />;
}
