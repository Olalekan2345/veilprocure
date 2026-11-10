/**
 * Inline, so it runs while the page body is parsed — before anything below the fold is painted —
 * letting reveal targets start hidden without a flash. Without JavaScript the class is never added
 * and everything stays visible. (A server component: rendered as plain HTML, never re-run.)
 */
export function MotionBoot() {
  return <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('vp-motion')" }} />;
}
