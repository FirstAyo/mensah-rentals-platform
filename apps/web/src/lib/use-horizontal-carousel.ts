'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
} from 'react';

export function useHorizontalCarousel({
  activeQuery,
  intervalMs = 6500,
  itemCount,
}: {
  activeQuery?: string;
  intervalMs?: number;
  itemCount: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [queryMatches, setQueryMatches] = useState(!activeQuery);

  const pauseAfterInteraction = useCallback(() => {
    setInteractionPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setInteractionPaused(false), 8000);
  }, []);

  const move = useCallback(
    (direction: -1 | 1, interactive = true) => {
      const track = trackRef.current;
      if (!track) return;
      if (interactive) pauseAfterInteraction();
      const distance = Math.max(track.clientWidth * 0.82, 240);
      const atEnd =
        direction === 1 &&
        track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
      const atStart = direction === -1 && track.scrollLeft <= 8;
      track.scrollTo({
        left: atEnd
          ? 0
          : atStart
            ? track.scrollWidth
            : track.scrollLeft + direction * distance,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    },
    [pauseAfterInteraction, reducedMotion],
  );

  useEffect(() => {
    if (!activeQuery) return;
    const query = window.matchMedia(activeQuery);
    const update = () => setQueryMatches(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [activeQuery]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const update = () =>
      setDocumentHidden(document.visibilityState !== 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.15 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (
      !queryMatches ||
      itemCount < 2 ||
      interactionPaused ||
      focusWithin ||
      hovered ||
      documentHidden ||
      !visible ||
      reducedMotion
    )
      return;
    const timer = setInterval(() => move(1, false), intervalMs);
    return () => clearInterval(timer);
  }, [
    documentHidden,
    focusWithin,
    hovered,
    interactionPaused,
    intervalMs,
    itemCount,
    move,
    queryMatches,
    reducedMotion,
    visible,
  ]);

  useEffect(
    () => () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    },
    [],
  );

  return {
    move,
    sectionProps: {
      onBlur: (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocusWithin(false);
      },
      onFocus: () => setFocusWithin(true),
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      ref: sectionRef,
    },
    trackProps: {
      onPointerDown: pauseAfterInteraction,
      onWheel: pauseAfterInteraction,
      ref: trackRef,
    },
  };
}
