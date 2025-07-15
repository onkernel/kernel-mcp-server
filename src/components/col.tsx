import { cn } from '@/lib/cn';

export interface ColProps {
  as?: React.ElementType;
  children?: React.ReactNode;
  className?: string;
}

export const Col = ({ as: Component = 'div', children, className }: ColProps): React.ReactElement => {
  return <Component className={cn('flex flex-col', className)}>{children}</Component>;
}; 