"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Floating "back to top" control. Appears once the first screen has been scrolled past; its ring
 * fills with scroll progress. Returns focus to the top of the page so keyboard users continue from
 * the header. (Without JavaScript the footer's plain "Back to top" link does the same job.)
 * On Netlify's free plan a "Powered by Netlify" badge (#nl-badge-frame) is pinned to the same
 * corner above everything; the button lifts itself clear of it instead of hiding under it.
 */
export function BackToTop() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      el.dataset.show = String(window.scrollY > window.innerHeight * 0.9);
      el.style.setProperty("--sp", max > 0 ? (window.scrollY / max).toFixed(4) : "0");
      const badge = document.getElementById("nl-badge-frame")?.getBoundingClientRect();
      const lift = badge && badge.height > 0 && badge.top < window.innerHeight ? window.innerHeight - badge.top : 0;
      el.style.setProperty("--lift", `${Math.round(lift)}px`);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <a
      ref={ref}
      href="#top"
      aria-label="Back to top"
      className="vp-totop"
      data-show="false"
      onClick={(e) => {
        e.preventDefault();
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
        document.querySelector<HTMLElement>(".vp-header a")?.focus({ preventScroll: true });
      }}
    >
      <span className="vp-totop-label" aria-hidden>
        Back to top
      </span>
      <span className="vp-totop-btn">
        <svg className="vp-totop-ring" viewBox="0 0 48 48" aria-hidden>
          <circle cx="24" cy="24" r="22" pathLength={100} className="vp-totop-track" />
          <circle cx="24" cy="24" r="22" pathLength={100} className="vp-totop-progress" />
        </svg>
        <ArrowUp className="vp-totop-arrow size-[18px]" aria-hidden />
      </span>
    </a>
  );
}
