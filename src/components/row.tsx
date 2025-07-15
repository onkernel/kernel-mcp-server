import { cn } from '@/lib/cn';

export interface RowProps {
  as?: React.ElementType;
  children?: React.ReactNode;
  className?: string;
}

export const Row = ({ as: Component = 'div', children, className }: RowProps): React.ReactElement => {
  return <Component className={cn('flex flex-row items-center', className)}>{children}</Component>;
}; 