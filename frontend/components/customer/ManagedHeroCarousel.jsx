import React, { useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import BrandButton from "../ui/BrandButton";
import Modal from "../owner/Modal";

// Deliberately manual: no public API currently exposes management autoplay
// settings. No timer, focus movement or reduced-motion exception is needed.
const ManagedHeroCarousel = ({ slides, loading = false }) => {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const touchStart = useRef(null);
  const current = slides.length ? index % slides.length : 0;
  const slide = slides[current];
  const move = (delta) =>
    setIndex((value) => (value + delta + slides.length) % slides.length);
  const onKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    }
  };
  const controls = slides.length > 1;
  return (
    <>
      <section
        className={`managed-hero ${slide?.image ? "managed-hero-with-image" : ""}`}
        aria-label="10th West store highlights"
        aria-roledescription={controls ? "carousel" : undefined}
        aria-busy={loading}
        tabIndex={controls ? 0 : undefined}
        onKeyDown={controls ? onKeyDown : undefined}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          touchStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start || !controls) return;
          const touch = event.changedTouches[0];
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5)
            move(dx < 0 ? 1 : -1);
        }}
      >
        {slide?.image && (
          <img
            key={slide.image}
            src={slide.image}
            alt=""
            width="1600"
            height="600"
            fetchPriority="high"
            className="managed-hero-image"
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
            }}
          />
        )}
        <div
          className="managed-hero-content mx-auto max-w-[1500px]"
          role={slide ? "group" : undefined}
          aria-roledescription={slide ? "slide" : undefined}
          aria-label={slide ? `${current + 1} of ${slides.length}` : undefined}
        >
          {loading ? (
            <p className="managed-hero-label" role="status">
              Loading store highlights...
            </p>
          ) : (
            <>
              <h1>{slide?.title || "Parts built for the ride."}</h1>
              <p className="managed-hero-description">
                {slide?.text ||
                  (!slide
                    ? "Dependable motorcycle parts, oils and accessories. Find your next part at 10th West."
                    : "")}
              </p>
              {!slide ? (
                <BrandButton to="/shop" size="lg">
                  Shop Parts <ArrowRight size={18} aria-hidden="true" />
                </BrandButton>
              ) : (
                slide.destination &&
                (slide.destination.internal ? (
                  <BrandButton to={slide.destination.href} size="lg">
                    {slide.cta}
                    <ArrowRight size={18} aria-hidden="true" />
                  </BrandButton>
                ) : (
                  <BrandButton as="a" href={slide.destination.href} size="lg">
                    {slide.cta}
                    <ArrowRight size={18} aria-hidden="true" />
                  </BrandButton>
                ))
              )}
              {slide &&
                (slide.text.length > 180 || slide.title.length > 85) && (
                  <button
                    type="button"
                    className="managed-hero-read-more"
                    onClick={() => setExpanded(slide)}
                  >
                    Read full{" "}
                    {slide.kind === "Store announcement"
                      ? "announcement"
                      : "details"}
                  </button>
                )}
            </>
          )}
        </div>
        {controls && (
          <div className="managed-hero-controls mx-auto max-w-[1500px]">
            <button
              type="button"
              className="managed-hero-arrow"
              onClick={() => move(-1)}
              aria-label="Previous slide"
            >
              <ArrowLeft size={19} aria-hidden="true" />
            </button>
            <div
              className="managed-hero-pagination"
              aria-label="Choose a store highlight"
            >
              {slides.map((item, number) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setIndex(number)}
                  aria-label={`Go to slide ${number + 1}: ${item.title}`}
                  aria-current={number === current ? "true" : undefined}
                >
                  <span />
                </button>
              ))}
            </div>
            <button
              type="button"
              className="managed-hero-arrow"
              onClick={() => move(1)}
              aria-label="Next slide"
            >
              <ArrowRight size={19} aria-hidden="true" />
            </button>
            <span
              className="managed-hero-count"
              aria-live="polite"
              aria-atomic="true"
            >
              {current + 1} / {slides.length}
            </span>
          </div>
        )}
      </section>
      <Modal
        isOpen={Boolean(expanded)}
        onClose={() => setExpanded(null)}
        title={expanded?.title || "Store highlight"}
        size="lg"
      >
        <div className="p-5 text-sm leading-7 text-slate-700 whitespace-pre-line">
          {expanded?.text}
        </div>
      </Modal>
    </>
  );
};
export default ManagedHeroCarousel;
