import React, {useEffect, useRef} from "react";
import {progressStore} from "../../playback/progressStore";

/**
 * GlobalPlayhead
 * Renders a vertical red bar with an upside-down triangle at the top.
 * Optimized: Uses direct DOM manipulation to avoid React render cycles during playback.
 */
export default function GlobalPlayhead({totalLengthMs = 0, timelineWidth = 0}) {
  const playheadRef = useRef(null);

  useEffect(() => {
    const updatePosition = (ms, lengthMs) => {
      if (!playheadRef.current) return;
      if (timelineWidth <= 0) return;

      const denom = totalLengthMs > 0 ? totalLengthMs : lengthMs || 0;
      const cappedRatio = denom > 0 ? Math.max(0, Math.min(1, ms / denom)) : 0;
      const leftPx = cappedRatio * timelineWidth;
      
      // Get the ruler bar element to calculate screen position
      const rulerBar = document.querySelector('.timeline-ruler-bar');
      const scrollArea = document.querySelector('.timeline-scroll-area');
      const tracksContainer = document.querySelector('.tracks-container');
      
      if (rulerBar && scrollArea && tracksContainer) {
        const rulerRect = rulerBar.getBoundingClientRect();
        const tracksRect = tracksContainer.getBoundingClientRect();
        
        // Calculate horizontal position
        const screenX = rulerRect.left + leftPx;
        playheadRef.current.style.left = `${screenX}px`;
        
        // Position at top of ruler
        const topY = rulerRect.top;
        playheadRef.current.style.top = `${topY}px`;
        
        // Height extends to bottom of tracks
        const height = Math.max(0, tracksRect.bottom - rulerRect.top);
        playheadRef.current.style.height = `${height}px`;
      }
    };

    const currentState = progressStore.getState();
    updatePosition(currentState.ms || 0, currentState.lengthMs || 0);

    // Subscribe to the store without triggering React state updates
    const unsubscribe = progressStore.subscribe(({ms, lengthMs}) => {
      updatePosition(ms, lengthMs);
    });

    // Update position on scroll
    const scrollArea = document.querySelector('.timeline-scroll-area');
    const handleScroll = () => {
      const currentState = progressStore.getState();
      updatePosition(currentState.ms || 0, currentState.lengthMs || 0);
    };
    
    if (scrollArea) {
      scrollArea.addEventListener('scroll', handleScroll);
    }
    
    // Update position on resize
    const handleResize = () => {
      const currentState = progressStore.getState();
      updatePosition(currentState.ms || 0, currentState.lengthMs || 0);
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      unsubscribe();
      if (scrollArea) {
        scrollArea.removeEventListener('scroll', handleScroll);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [totalLengthMs, timelineWidth]);

  if (!timelineWidth) return null;

  return (
    <div
      ref={playheadRef}
      className="global-playhead"
      style={{willChange: "transform"}}
    />
  );
}