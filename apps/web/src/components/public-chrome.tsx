import { SiteFooter, SiteHeader } from "./site/site-chrome";

/** Header and footer of the public website around policy and support pages. */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}
