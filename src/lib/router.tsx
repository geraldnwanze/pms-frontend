'use client';

/**
 * Thin compatibility layer that maps the small slice of the `react-router-dom`
 * API this app used onto Next.js' App Router (`next/navigation` + `next/link`).
 *
 * Keeping the original call sites (`navigate('/x')`, `<Link to=…>`, `useParams()`)
 * intact means the migration touched only import paths, not component logic.
 */
import NextLink from 'next/link';
import {
  useRouter,
  usePathname,
  useParams as useNextParams,
} from 'next/navigation';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

/** react-router's `useNavigate` — returns a `navigate(to, { replace })` function. */
export function useNavigate() {
  const router = useRouter();
  return (to: string | number, opts?: { replace?: boolean }) => {
    if (typeof to === 'number') {
      // navigate(-1) / navigate(1) → history traversal
      if (to < 0) router.back();
      else router.forward();
      return;
    }
    if (opts?.replace) router.replace(to);
    else router.push(to);
  };
}

/** react-router's `useParams` — dynamic segments as a string map. */
export function useParams<
  T extends Record<string, string> = Record<string, string>,
>(): T {
  return (useNextParams() ?? {}) as T;
}

/** react-router's `useLocation` — only `pathname` is consumed in this app. */
export function useLocation(): { pathname: string } {
  return { pathname: usePathname() ?? '/' };
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string;
  children?: ReactNode;
};

/** react-router `<Link to>` → Next `<Link href>`. */
export function Link({ to, children, ...rest }: LinkProps) {
  return (
    <NextLink href={to} {...rest}>
      {children}
    </NextLink>
  );
}

/**
 * react-router `<NavLink to>` → Next `<Link href>`. In this app active styling
 * is computed by the caller (not via NavLink's render-prop), so a plain link
 * wrapper is a faithful drop-in.
 */
export function NavLink({ to, children, ...rest }: LinkProps) {
  return (
    <NextLink href={to} {...rest}>
      {children}
    </NextLink>
  );
}
