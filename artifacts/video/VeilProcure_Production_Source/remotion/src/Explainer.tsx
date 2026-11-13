import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";
import { Diagram, Outro, Rpc } from "./Cards";
import { Footage } from "./Footage";
import { Hook } from "./Hook";
import { Captions, Chapter, TestnetBadge } from "./Overlays";
import { C, FPS } from "./theme";
import type { Segment, Timeline } from "./types";

const DARK = new Set(["hook", "diagram", "rpc", "outro"]);

const SegmentView: React.FC<{ seg: Segment; meta: Timeline["footageMeta"] }> = ({ seg, meta }) => {
  switch (seg.type) {
    case "footage":
      return <Footage seg={seg} meta={meta[seg.cam]!} />;
    case "hook":
      return <Hook dur={seg.dur} />;
    case "diagram":
      return <Diagram />;
    case "rpc":
      return <Rpc title={seg.title} note={seg.note} txs={seg.txs} balance={seg.balance} />;
    case "outro":
      return <Outro />;
  }
};

/** Each segment fades in over the previous one, which is held for that overlap. */
const Faded: React.FC<{ fadeIn: number; children: React.ReactNode }> = ({ fadeIn, children }) => {
  const frame = useCurrentFrame();
  const o = fadeIn > 0 ? interpolate(frame, [0, fadeIn * FPS], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const Explainer: React.FC<{ timeline: Timeline }> = ({ timeline }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const segs = timeline.segments;
  const current = [...segs].reverse().find((s) => t >= s.start) ?? segs[0]!;
  const isDarkAt = (time: number) => {
    const s = [...segs].reverse().find((x) => time >= x.start) ?? segs[0]!;
    return DARK.has(s.type);
  };
  const testnet = timeline.testnet.some((r) => t >= r.start && t < r.end);
  return (
    <AbsoluteFill style={{ background: C.canvas }}>
      {segs.map((seg, i) => {
        const next = segs[i + 1];
        const hold = next?.fadeIn ?? 0;
        return (
          <Sequence key={seg.id} from={Math.round(seg.start * FPS)} durationInFrames={Math.max(1, Math.round((seg.dur + hold) * FPS))} name={seg.id}>
            <Faded fadeIn={i === 0 ? 0 : (seg.fadeIn ?? 0)}>
              <SegmentView seg={seg} meta={timeline.footageMeta} />
            </Faded>
          </Sequence>
        );
      })}
      {"chapter" in current && typeof (current as { chapter?: string }).chapter === "string" && <Chapter text={(current as { chapter?: string }).chapter!} dark={DARK.has(current.type)} />}
      <TestnetBadge visible={testnet} />
      <Captions captions={timeline.captions} dark={isDarkAt} />
    </AbsoluteFill>
  );
};
