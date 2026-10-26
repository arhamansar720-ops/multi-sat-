import Link from "next/link";
import { PRODUCT } from "@/lib/config";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path d="M9 20.5 14 9l3.2 7.2L19.5 12 23 20.5" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="20.5" r="2" fill="white" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 rounded-lg font-semibold tracking-tight", className)} aria-label={`${PRODUCT.name} home`}>
      <LogoMark />
      <span className="text-[15px]">{PRODUCT.name}</span>
    </Link>
  );
}
