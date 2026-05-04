import type { SVGProps } from 'react';
import { cn } from '@/lib/utils';

type Props = SVGProps<SVGSVGElement> & { title?: string };

/**
 * Monochrome X logo (formerly Twitter) for inline platform badges.
 */
export function XPlatformIcon({ className, title, ...props }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('shrink-0', className)}
      fill="currentColor"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
