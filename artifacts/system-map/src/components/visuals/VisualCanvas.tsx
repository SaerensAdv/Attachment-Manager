import { forwardRef } from "react";
import { colors, fonts } from "@workspace/brand";
import saLogo from "@/assets/sa-logo.webp";
import {
  CANVAS_SIZES,
  type StudioContent,
  type VisualTheme,
} from "@/lib/visuals";

/**
 * Full-size (1080px-wide) artboard for one visual. Rendered twice by the
 * studio: CSS-scaled for the live preview and unscaled (offscreen) for the
 * html-to-image export — the DOM is identical, so preview = export.
 *
 * Everything is inline-styled from @workspace/brand tokens: no Tailwind or
 * app CSS inside the artboard, which keeps the export deterministic and the
 * house style pixel-exact regardless of app theme.
 */
interface VisualCanvasProps {
  content: StudioContent;
  /** Which carousel slide to draw (ignored for single/quote). */
  slideIndex?: number;
}

interface Palette {
  bg: string;
  text: string;
  body: string;
  meta: string;
  kicker: string;
  accent: string;
  hairline: string;
  overlayTop: string;
  overlayBottom: string;
  logoFilter: string;
}

function palette(theme: VisualTheme): Palette {
  if (theme === "light") {
    return {
      bg: colors.panel,
      text: colors.ink,
      body: "#3D3D46",
      meta: colors.muted,
      kicker: colors.purple,
      accent: colors.amber,
      hairline: colors.hair,
      overlayTop: "rgba(245,245,248,0.72)",
      overlayBottom: "rgba(245,245,248,0.92)",
      logoFilter: "brightness(0)",
    };
  }
  return {
    bg: colors.nearblack,
    text: colors.white,
    body: "#C9C7D4",
    meta: colors.cardLabel,
    kicker: colors.amber,
    accent: colors.purple,
    hairline: "rgba(228,226,238,0.16)",
    overlayTop: "rgba(10,10,11,0.55)",
    overlayBottom: "rgba(10,10,11,0.88)",
    logoFilter: "brightness(0) invert(1)",
  };
}

function Background({
  p,
  image,
}: {
  p: Palette;
  image: string | null;
}): React.JSX.Element {
  return (
    <>
      {image ? (
        <>
          <img
            src={image}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(180deg, ${p.overlayTop} 0%, ${p.overlayBottom} 78%)`,
            }}
          />
        </>
      ) : (
        <>
          <div
            style={{
              position: "absolute",
              top: -260,
              right: -220,
              width: 760,
              height: 760,
              background: `radial-gradient(closest-side, ${colors.purple}44, transparent)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -300,
              left: -260,
              width: 820,
              height: 820,
              background: `radial-gradient(closest-side, ${colors.indigo}66, transparent)`,
            }}
          />
        </>
      )}
    </>
  );
}

function Header({ p }: { p: Palette }): React.JSX.Element {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 22,
      }}
    >
      <img
        src={saLogo}
        alt="Saerens Advertising"
        style={{ height: 52, width: "auto", filter: p.logoFilter }}
      />
      <span
        style={{
          fontFamily: fonts.bodyStack,
          fontWeight: 600,
          fontSize: 24,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: p.meta,
        }}
      >
        Saerens Advertising
      </span>
    </div>
  );
}

function Footer({
  p,
  right,
}: {
  p: Palette;
  right?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      style={{
        position: "relative",
        borderTop: `2px solid ${p.hairline}`,
        paddingTop: 34,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span
        style={{
          fontFamily: fonts.bodyStack,
          fontWeight: 500,
          fontSize: 26,
          color: p.meta,
        }}
      >
        saerensadvertising.com
      </span>
      {right}
    </div>
  );
}

export const VisualCanvas = forwardRef<HTMLDivElement, VisualCanvasProps>(
  function VisualCanvas({ content, slideIndex = 0 }, ref) {
    const { format, theme, backgroundImage } = content;
    const p = palette(theme);
    const { w, h } = CANVAS_SIZES[format];

    const frame: React.CSSProperties = {
      width: w,
      height: h,
      background: p.bg,
      position: "relative",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: 88,
      boxSizing: "border-box",
      fontFamily: fonts.bodyStack,
    };

    if (format === "quote") {
      const q = content.quote;
      return (
        <div ref={ref} style={frame}>
          <Background p={p} image={backgroundImage} />
          <Header p={p} />
          <div style={{ position: "relative" }}>
            <div
              style={{
                fontFamily: fonts.displayStack,
                fontWeight: 800,
                fontSize: 180,
                lineHeight: 0.6,
                color: p.accent,
                marginBottom: 18,
              }}
            >
              &ldquo;
            </div>
            <div
              style={{
                fontFamily: fonts.displayStack,
                fontWeight: 700,
                fontSize: 62,
                lineHeight: 1.22,
                letterSpacing: "-0.015em",
                color: p.text,
                overflowWrap: "break-word",
              }}
            >
              {q.quote}
            </div>
            <div
              style={{
                marginTop: 44,
                fontFamily: fonts.bodyStack,
                fontWeight: 600,
                fontSize: 30,
                color: p.kicker,
              }}
            >
              {q.attribution}
            </div>
          </div>
          <Footer p={p} />
        </div>
      );
    }

    if (format === "single") {
      const s = content.single;
      return (
        <div ref={ref} style={frame}>
          <Background p={p} image={backgroundImage} />
          <Header p={p} />
          <div style={{ position: "relative" }}>
            {s.kicker ? (
              <div
                style={{
                  fontFamily: fonts.bodyStack,
                  fontWeight: 600,
                  fontSize: 30,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: p.kicker,
                  marginBottom: 34,
                }}
              >
                {s.kicker}
              </div>
            ) : null}
            <div
              style={{
                fontFamily: fonts.displayStack,
                fontWeight: 800,
                fontSize: 84,
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
                color: p.text,
                overflowWrap: "break-word",
              }}
            >
              {s.headline}
            </div>
            {s.sub ? (
              <div
                style={{
                  marginTop: 40,
                  fontFamily: fonts.bodyStack,
                  fontWeight: 400,
                  fontSize: 38,
                  lineHeight: 1.4,
                  color: p.body,
                  maxWidth: 820,
                }}
              >
                {s.sub}
              </div>
            ) : null}
          </div>
          <Footer p={p} />
        </div>
      );
    }

    // Carousel slide.
    const slides = content.slides;
    const count = Math.max(slides.length, 1);
    const idx = Math.min(slideIndex, count - 1);
    const slide = slides[idx] ?? { kicker: "", title: "", body: "" };
    const isCover = idx === 0;
    const isLast = idx === count - 1;

    return (
      <div ref={ref} style={frame}>
        <Background p={p} image={backgroundImage} />
        <Header p={p} />
        <div style={{ position: "relative" }}>
          {slide.kicker ? (
            <div
              style={{
                fontFamily: fonts.bodyStack,
                fontWeight: 600,
                fontSize: 30,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: p.kicker,
                marginBottom: 30,
              }}
            >
              {slide.kicker}
            </div>
          ) : null}
          <div
            style={{
              fontFamily: fonts.displayStack,
              fontWeight: 800,
              fontSize: isCover ? 88 : 68,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              color: p.text,
              overflowWrap: "break-word",
            }}
          >
            {slide.title}
          </div>
          {slide.body ? (
            <div
              style={{
                marginTop: 38,
                fontFamily: fonts.bodyStack,
                fontWeight: 400,
                fontSize: 36,
                lineHeight: 1.45,
                color: p.body,
                maxWidth: 860,
              }}
            >
              {slide.body}
            </div>
          ) : null}
        </div>
        <Footer
          p={p}
          right={
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 26,
                fontFamily: fonts.bodyStack,
                fontWeight: 600,
                fontSize: 26,
                color: p.meta,
              }}
            >
              {String(idx + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
              {!isLast ? (
                <span style={{ color: p.kicker, fontSize: 34, lineHeight: 1 }}>
                  &rarr;
                </span>
              ) : null}
            </span>
          }
        />
      </div>
    );
  },
);
