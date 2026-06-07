import { Link, useLocation } from "wouter";
import { ReactNode } from "react";
import saerensLogo from "@/assets/saerens-logo.webp";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/ai-marketing", label: "Wat is AI marketing" },
    { href: "/diensten", label: "Diensten" },
    { href: "/cases", label: "Cases" },
    { href: "/over", label: "Over" },
    { href: "/blog", label: "Blog" },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col selection:bg-primary selection:text-white">
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 md:px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <img 
              src={saerensLogo} 
              alt="Saerens Advertising Logo" 
              className="h-8 w-auto brightness-0 invert group-hover:text-primary transition-all duration-300"
              style={{ filter: 'brightness(0) invert(1) drop-shadow(0 0 0.5rem rgba(113, 107, 235, 0.2))' }}
            />
            <span className="font-heading font-bold text-lg tracking-tight hidden sm:block">
              Saerens<span className="text-primary">.</span>agency
            </span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link 
                key={link.href} 
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  location === link.href ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <Link 
              href="/contact" 
              className="inline-flex h-10 items-center justify-center rounded-full bg-accent px-6 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Contact
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="border-t border-white/5 bg-[#050505] pt-16 pb-8">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="md:col-span-2">
              <Link href="/" className="flex items-center gap-2 mb-6">
                <img 
                  src={saerensLogo} 
                  alt="Saerens Advertising Logo" 
                  className="h-8 w-auto brightness-0 invert"
                />
                <span className="font-heading font-bold text-lg tracking-tight">
                  Saerens<span className="text-primary">.</span>agency
                </span>
              </Link>
              <p className="text-muted-foreground max-w-sm mb-8">
                AI Marketing Bureau in België dat bewijs levert. Google Partner. Wij zetten AI in als werktuig, niet als belofte.
              </p>
            </div>
            
            <div>
              <h3 className="font-heading font-semibold mb-4 text-foreground">Menu</h3>
              <ul className="space-y-3">
                {navLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-muted-foreground hover:text-primary transition-colors text-sm">
                      {link.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/contact" className="text-muted-foreground hover:text-primary transition-colors text-sm">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-heading font-semibold mb-4 text-foreground">Contact</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>Actief in België en Nederland</li>
                <li>Google Partner-gecertificeerd</li>
                <li>Reactie binnen één werkdag</li>
                <li className="pt-4">
                  <a href="mailto:info@saerens.agency" className="text-primary hover:underline">
                    info@saerens.agency
                  </a>
                </li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between text-xs text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} Saerens Advertising. Alle rechten voorbehouden.</p>
            <div className="flex gap-4 mt-4 md:mt-0">
              <span>AI is een werktuig, geen belofte.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
