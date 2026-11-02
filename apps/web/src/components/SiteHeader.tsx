import { useEffect, useState } from "preact/hooks";
import { isSignedIn } from "../lib/session-hint";
import { Logo } from "./Logo";

const LINKS = [
  { label: "Guides", href: "/guides" },
  { label: "Providers", href: "/providers", directoryOnly: true },
  { label: "Pricing", href: "/pricing" },
  { label: "Trust", href: "/trust" },
];

/** `onDirectory` adds the Providers link, which the design shows on directory pages. */
export function SiteHeader({ onDirectory = false }: { onDirectory?: boolean }) {
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(isSignedIn()), []);
  const account = signedIn
    ? { label: "Dashboard", href: "/dashboard" }
    : { label: "Sign in", href: "/sign-in" };
  const links = LINKS.filter((link) => !link.directoryOnly || onDirectory);

  return (
    <header class="site-header">
      <div class="wrap site-header__bar">
        <a href="/" aria-label="StillScans home" class="brand">
          <Logo />
          <span class="brand__name">StillScans</span>
        </a>
        <button
          type="button"
          class="menu-btn"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <nav aria-label="Main" class="site-nav">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              class={link.directoryOnly ? "is-current" : undefined}
            >
              {link.label}
            </a>
          ))}
          <a href={account.href} class="site-nav__signin">
            {account.label}
          </a>
        </nav>
      </div>
      {open && (
        <nav aria-label="Main" class="menu-sheet">
          {links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
          <a href={account.href}>{account.label}</a>
        </nav>
      )}
    </header>
  );
}
