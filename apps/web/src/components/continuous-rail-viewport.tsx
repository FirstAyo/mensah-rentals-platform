'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { useEffect, useRef, useState } from 'react';

export function ContinuousRailViewport({
  className = '',
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  const [documentHidden, setDocumentHidden] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const updateVisibility = () => setDocumentHidden(document.hidden);
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      document.removeEventListener('visibilitychange', updateVisibility);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  const pauseForInteraction = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    setInteracting(true);
  };
  const resumeAfterInteraction = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setInteracting(false), 1200);
  };

  return (
    <div
      {...props}
      className={`continuous-rail continuous-rail-viewport ${className}`}
      data-paused={documentHidden || interacting ? 'true' : 'false'}
      onPointerCancel={resumeAfterInteraction}
      onPointerDown={pauseForInteraction}
      onPointerLeave={resumeAfterInteraction}
      onPointerUp={resumeAfterInteraction}
    />
  );
}
