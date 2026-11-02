import { Logo } from "./Logo";
import { LogoutButton } from "./LogoutButton";

const LINKS = [
  { label: "Your codes", href: "/dashboard" },
  { label: "Create a code", href: "/create" },
];

/** The signed-in app's header. It deliberately has no marketing links. */
export function AppHeader() {
  const here = window.location.pathname.replace(/\/$/, "");
  return (
    <header class="app-header">
      <div class="wrap app-header__bar">
        <a href="/dashboard" aria-label="Your codes" class="brand">
          <Logo />
          <span class="brand__name">StillScans</span>
        </a>
        <nav aria-label="App" class="app-nav">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              aria-current={here.startsWith(link.href) ? "page" : undefined}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <LogoutButton />
      </div>
    </header>
  );
}
