"use client";

import { useEffect } from "react";

/**
 * Progressive enhancement for the public site: scroll reveals, header state, the four-step rail,
 * light parallax and FAQ deep links. User-driven only — no scroll hijacking, nothing autoplays.
 */
export function SiteMotion() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("vp-motion");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    document.querySelectorAll("[data-reveal], [data-reveal-group], [data-observe]").forEach((el) => io.observe(el));

    const header = document.querySelector<HTMLElement>(".vp-header");
    const steps = document.querySelector<HTMLElement>("[data-steps]");
    const stepItems = steps ? Array.from(steps.querySelectorAll<HTMLElement>("[data-step]")) : [];
    const parallax = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));

    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      if (header) header.dataset.scrolled = String(window.scrollY > 8);
      if (steps) {
        const r = steps.getBoundingClientRect();
        // 0 when the rail enters the lower part of the viewport, 1 when it reaches the upper third.
        const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.85 - vh * 0.3 + r.height * 0.4)));
        const progress = reduced.matches ? 1 : p;
        steps.style.setProperty("--progress", progress.toFixed(3));
        stepItems.forEach((el, i) => {
          el.dataset.active = String(reduced.matches || progress >= i / stepItems.length + 0.02 || (i === 0 && progress > 0));
        });
      }
      if (!reduced.matches) {
        for (const el of parallax) {
          const r = el.getBoundingClientRect();
          const centre = (r.top + r.height / 2 - vh / 2) / vh;
          el.style.setProperty("--py", Math.max(-1, Math.min(1, centre)).toFixed(3));
        }
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    // Deep links to an FAQ answer open it (e.g. "See bid privacy safeguards" → #faq-quotes).
    const openTarget = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (el instanceof HTMLDetailsElement) el.open = true;
    };
    openTarget();
    window.addEventListener("hashchange", openTarget);

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("hashchange", openTarget);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
