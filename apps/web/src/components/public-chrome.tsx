import { BackToTop } from "./site/back-to-top";
import { SiteFooter, SiteHeader } from "./site/site-chrome";

/** Header and footer of the public website around policy and support pages. */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site" id="top">
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
      <BackToTop />
    </div>
  );
}
