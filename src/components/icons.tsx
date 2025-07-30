import { Info } from 'lucide-react';
import Image from 'next/image';

type AppIcon = {
  alt?: string;
  className?: string;
  height?: number;
  size?: number;
  src?: string;
  width?: number;
};

export const KernelIcon = ({
  alt = 'Kernel Icon',
  className,
  width = 32,
  height = 32,
  size = 32,
}: AppIcon) => {
  return (
    <Image
      alt={alt}
      className={className}
      height={size ?? height}
      priority={true}
      src="/icon.png"
      width={size ?? width}
    />
  );
};

export const InfoIcon = Info;
