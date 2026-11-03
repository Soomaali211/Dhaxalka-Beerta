import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Hand,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export interface InteractivePanZoomHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  setZoomAroundCenter: (targetZoom: number) => void;
  resetView: () => void;
  nudge: (dx: number, dy: number) => void;
}

interface InteractivePanZoomViewportProps {
  children: React.ReactNode;
  zoom?: number;
  onZoomChange?: (nextZoom: number) => void;
  minZoom?: number;
  maxZoom?: number;
  initialAlign?: 'center' | 'top';
  resetKey?: string | number;
  onViewportResize?: (dims: { w: number; h: number }) => void;
  showFloatingControls?: boolean;
  className?: string;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export const InteractivePanZoomViewport = forwardRef<
  InteractivePanZoomHandle,
  InteractivePanZoomViewportProps
>(function InteractivePanZoomViewport(
  {
    children,
    zoom: controlledZoom,
    onZoomChange,
    minZoom = 0.35,
    maxZoom = 8.0,
    initialAlign = 'center',
    resetKey,
    onViewportResize,
    showFloatingControls = true,
    className = '',
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const stateRef = useRef<{ zoom: number; panX: number; panY: number }>({
    zoom: controlledZoom ?? 1,
    panX: 0,
    panY: 0,
  });

  const [viewState, setViewState] = useState<{
    zoom: number;
    panX: number;
    panY: number;
  }>({
    zoom: controlledZoom ?? 1,
    panX: 0,
    panY: 0,
  });

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const hasCenteredRef = useRef<boolean>(false);
  const lastResetKeyRef = useRef<string | number | undefined>(resetKey);

  // Touch & Mouse gesture refs
  const touchDragRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);

  const pinchRef = useRef<{
    midX: number;
    midY: number;
    dist: number;
  } | null>(null);

  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);

  const clampPan = useCallback((rawX: number, rawY: number, z: number) => {
    const container = containerRef.current;
    const stage = stageRef.current;
    if (!container || !stage) {
      return { panX: rawX, panY: rawY };
    }
    const viewW = container.clientWidth;
    const viewH = container.clientHeight;
    const stageW = stage.offsetWidth;
    const stageH = stage.offsetHeight;
    if (viewW <= 0 || viewH <= 0 || stageW <= 0 || stageH <= 0) {
      return { panX: rawX, panY: rawY };
    }

    const scaledW = stageW * z;
    const scaledH = stageH * z;
    const keepX = Math.min(84, viewW * 0.22, scaledW * 0.45);
    const keepY = Math.min(84, viewH * 0.22, scaledH * 0.45);

    const minX = keepX - scaledW;
    const maxX = viewW - keepX;
    const minY = keepY - scaledH;
    const maxY = viewH - keepY;

    return {
      panX: clamp(rawX, minX, maxX),
      panY: clamp(rawY, minY, maxY),
    };
  }, []);

  const commitState = useCallback(
    (nextZoom: number, rawPanX: number, rawPanY: number, notifyParent = true) => {
      const z = +clamp(nextZoom, minZoom, maxZoom).toFixed(3);
      const { panX, panY } = clampPan(rawPanX, rawPanY, z);
      stateRef.current = { zoom: z, panX, panY };
      setViewState({ zoom: z, panX, panY });
      if (notifyParent && onZoomChange) {
        onZoomChange(z);
      }
    },
    [clampPan, maxZoom, minZoom, onZoomChange]
  );

  const computeHomePan = useCallback(
    (targetZoom = 1) => {
      const container = containerRef.current;
      const stage = stageRef.current;
      if (!container || !stage) return { panX: 0, panY: 0 };
      const viewW = container.clientWidth;
      const viewH = container.clientHeight;
      const stageW = stage.offsetWidth * targetZoom;
      const stageH = stage.offsetHeight * targetZoom;

      const panX = Math.round((viewW - stageW) / 2);
      const panY =
        initialAlign === 'top'
          ? Math.max(12, Math.min(20, Math.round((viewH - stageH) / 2)))
          : Math.round((viewH - stageH) / 2);

      return { panX, panY };
    },
    [initialAlign]
  );

  const resetView = useCallback(() => {
    const home = computeHomePan(1);
    commitState(1, home.panX, home.panY, true);
  }, [commitState, computeHomePan]);

  const zoomAtPoint = useCallback(
    (targetZoom: number, focalX: number, focalY: number) => {
      const prev = stateRef.current;
      const nextZ = clamp(targetZoom, minZoom, maxZoom);
      const ratio = nextZ / (prev.zoom || 1);
      const nextPanX = focalX - ratio * (focalX - prev.panX);
      const nextPanY = focalY - ratio * (focalY - prev.panY);
      commitState(nextZ, nextPanX, nextPanY, true);
    },
    [commitState, maxZoom, minZoom]
  );

  const setZoomAroundCenter = useCallback(
    (targetZoom: number) => {
      const container = containerRef.current;
      const cx = container ? container.clientWidth / 2 : 0;
      const cy = container ? container.clientHeight / 2 : 0;
      zoomAtPoint(targetZoom, cx, cy);
    },
    [zoomAtPoint]
  );

  const zoomIn = useCallback(() => {
    setZoomAroundCenter(stateRef.current.zoom * 1.28);
  }, [setZoomAroundCenter]);

  const zoomOut = useCallback(() => {
    setZoomAroundCenter(stateRef.current.zoom / 1.28);
  }, [setZoomAroundCenter]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      const prev = stateRef.current;
      commitState(prev.zoom, prev.panX + dx, prev.panY + dy, false);
    },
    [commitState]
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomIn,
      zoomOut,
      setZoomAroundCenter,
      resetView,
      nudge,
    }),
    [nudge, resetView, setZoomAroundCenter, zoomIn, zoomOut]
  );

  // Sync external controlledZoom if changed from outside (e.g. parent toolbar button)
  useEffect(() => {
    if (
      typeof controlledZoom === 'number' &&
      Math.abs(controlledZoom - stateRef.current.zoom) > 0.01
    ) {
      if (controlledZoom === 1) {
        const home = computeHomePan(1);
        commitState(1, home.panX, home.panY, false);
      } else {
        const container = containerRef.current;
        const cx = container ? container.clientWidth / 2 : 0;
        const cy = container ? container.clientHeight / 2 : 0;
        const prev = stateRef.current;
        const nextZ = clamp(controlledZoom, minZoom, maxZoom);
        const ratio = nextZ / (prev.zoom || 1);
        const nextPanX = cx - ratio * (cx - prev.panX);
        const nextPanY = cy - ratio * (cy - prev.panY);
        commitState(nextZ, nextPanX, nextPanY, false);
      }
    }
  }, [commitState, computeHomePan, controlledZoom, maxZoom, minZoom]);

  // Measure viewport & auto-center on initial mount or when resetKey changes
  useEffect(() => {
    const container = containerRef.current;
    const stage = stageRef.current;
    if (!container || !stage) return;

    const handleMeasure = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 40 && h > 40 && onViewportResize) {
        onViewportResize({ w, h });
      }
      if (w > 40 && h > 40 && stage.offsetWidth > 20 && !hasCenteredRef.current) {
        hasCenteredRef.current = true;
        const home = computeHomePan(stateRef.current.zoom);
        commitState(stateRef.current.zoom, home.panX, home.panY, false);
      }
    };

    handleMeasure();
    const rafId = window.requestAnimationFrame(handleMeasure);

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => handleMeasure());
      ro.observe(container);
      ro.observe(stage);
      return () => {
        window.cancelAnimationFrame(rafId);
        ro.disconnect();
      };
    }

    window.addEventListener('resize', handleMeasure);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleMeasure);
    };
  }, [commitState, computeHomePan, onViewportResize]);

  useEffect(() => {
    if (lastResetKeyRef.current !== resetKey) {
      lastResetKeyRef.current = resetKey;
      hasCenteredRef.current = false;
      const raf = window.requestAnimationFrame(() => {
        hasCenteredRef.current = true;
        const home = computeHomePan(1);
        commitState(1, home.panX, home.panY, true);
      });
      return () => window.cancelAnimationFrame(raf);
    }
  }, [commitState, computeHomePan, resetKey]);

  // Non-passive wheel / trackpad pinch zoom around cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const fx = e.clientX - rect.left;
      const fy = e.clientY - rect.top;
      const sensitivity = e.ctrlKey ? 0.0085 : 0.0022;
      const factor = Math.exp(-e.deltaY * sensitivity);
      zoomAtPoint(stateRef.current.zoom * factor, fx, fy);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [zoomAtPoint]);

  // Mouse drag handlers (360° free pan on desktop)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-panzoom-control="true"]')) return;

    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    let lastX = e.clientX - rect.left;
    let lastY = e.clientY - rect.top;
    setIsDragging(true);

    const onMouseMove = (ev: MouseEvent) => {
      const r = container.getBoundingClientRect();
      const currX = ev.clientX - r.left;
      const currY = ev.clientY - r.top;
      const dx = currX - lastX;
      const dy = currY - lastY;
      lastX = currX;
      lastY = currY;
      const prev = stateRef.current;
      commitState(prev.zoom, prev.panX + dx, prev.panY + dy, false);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-panzoom-control="true"]')) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const fx = e.clientX - rect.left;
    const fy = e.clientY - rect.top;
    if (stateRef.current.zoom >= 4.2) {
      resetView();
    } else {
      zoomAtPoint(stateRef.current.zoom * 1.85, fx, fy);
    }
  };

  // Touch handlers: 1-finger 360° free hand pan + 2-finger focal pinch-zoom + double-tap zoom
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-panzoom-control="true"]')) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    if (e.touches.length === 1) {
      const x = e.touches[0].clientX - rect.left;
      const y = e.touches[0].clientY - rect.top;
      pinchRef.current = null;
      touchDragRef.current = {
        startX: x,
        startY: y,
        lastX: x,
        lastY: y,
        moved: false,
      };
      setIsDragging(true);
    } else if (e.touches.length >= 2) {
      touchDragRef.current = null;
      const x0 = e.touches[0].clientX - rect.left;
      const y0 = e.touches[0].clientY - rect.top;
      const x1 = e.touches[1].clientX - rect.left;
      const y1 = e.touches[1].clientY - rect.top;
      pinchRef.current = {
        midX: (x0 + x1) / 2,
        midY: (y0 + y1) / 2,
        dist: Math.max(8, Math.hypot(x0 - x1, y0 - y1)),
      };
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-panzoom-control="true"]')) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    if (e.touches.length === 1 && touchDragRef.current) {
      const currX = e.touches[0].clientX - rect.left;
      const currY = e.touches[0].clientY - rect.top;
      const dx = currX - touchDragRef.current.lastX;
      const dy = currY - touchDragRef.current.lastY;
      if (
        Math.hypot(
          currX - touchDragRef.current.startX,
          currY - touchDragRef.current.startY
        ) > 7
      ) {
        touchDragRef.current.moved = true;
      }
      touchDragRef.current.lastX = currX;
      touchDragRef.current.lastY = currY;
      const prev = stateRef.current;
      commitState(prev.zoom, prev.panX + dx, prev.panY + dy, false);
    } else if (e.touches.length >= 2) {
      const x0 = e.touches[0].clientX - rect.left;
      const y0 = e.touches[0].clientY - rect.top;
      const x1 = e.touches[1].clientX - rect.left;
      const y1 = e.touches[1].clientY - rect.top;
      const midX = (x0 + x1) / 2;
      const midY = (y0 + y1) / 2;
      const dist = Math.max(8, Math.hypot(x0 - x1, y0 - y1));

      if (!pinchRef.current) {
        pinchRef.current = { midX, midY, dist };
        return;
      }

      const prevState = stateRef.current;
      const ratio = dist / pinchRef.current.dist;
      const nextZoom = clamp(prevState.zoom * ratio, minZoom, maxZoom);
      const effectiveScale = nextZoom / (prevState.zoom || 1);

      const nextPanX =
        midX - effectiveScale * (pinchRef.current.midX - prevState.panX);
      const nextPanY =
        midY - effectiveScale * (pinchRef.current.midY - prevState.panY);

      pinchRef.current = { midX, midY, dist };
      commitState(nextZoom, nextPanX, nextPanY, true);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    // Seamless transition from 2-finger pinch down to 1-finger pan
    if (e.touches.length === 1) {
      pinchRef.current = null;
      const x = e.touches[0].clientX - rect.left;
      const y = e.touches[0].clientY - rect.top;
      touchDragRef.current = {
        startX: x,
        startY: y,
        lastX: x,
        lastY: y,
        moved: true,
      };
      return;
    }

    if (e.touches.length === 0) {
      // Detect double-tap to zoom in onto tapped plot/point
      if (touchDragRef.current && !touchDragRef.current.moved) {
        const now = Date.now();
        const tapX = touchDragRef.current.lastX;
        const tapY = touchDragRef.current.lastY;
        if (
          lastTapRef.current &&
          now - lastTapRef.current.time < 280 &&
          Math.hypot(tapX - lastTapRef.current.x, tapY - lastTapRef.current.y) < 30
        ) {
          lastTapRef.current = null;
          if (stateRef.current.zoom >= 4.2) {
            resetView();
          } else {
            zoomAtPoint(stateRef.current.zoom * 1.85, tapX, tapY);
          }
        } else {
          lastTapRef.current = { time: now, x: tapX, y: tapY };
        }
      }

      touchDragRef.current = null;
      pinchRef.current = null;
      setIsDragging(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = 64;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nudge(step, 0);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nudge(-step, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nudge(0, step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      nudge(0, -step);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomIn();
    } else if (e.key === '-') {
      e.preventDefault();
      zoomOut();
    } else if (e.key === '0') {
      e.preventDefault();
      resetView();
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onKeyDown={handleKeyDown}
      className={`pan-zoom-viewport relative overflow-hidden touch-none select-none outline-none ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      } ${className}`}
    >
      {/* Transformed Interactive Stage (Bypassed cleanly during @media print) */}
      <div
        ref={stageRef}
        style={{
          transformOrigin: '0 0',
          transform: `translate(${viewState.panX}px, ${viewState.panY}px) scale(${viewState.zoom})`,
        }}
        className="pan-zoom-stage absolute left-0 top-0 inline-block"
      >
        {children}
      </div>

      {/* Compact Floating Pan & Zoom HUD (Hidden when printing) */}
      {showFloatingControls && (
        <>
          <div
            data-panzoom-control="true"
            className="pointer-events-none absolute left-2.5 bottom-2.5 z-20 inline-flex items-center gap-1.5 rounded-lg bg-[#060d18]/85 border border-[#223250] px-2 py-1 text-[10.5px] font-semibold text-[#e8eef7] shadow-md backdrop-blur-xs print:hidden no-print"
          >
            <Hand className="h-3 w-3 text-[#22c55e] shrink-0" />
            <span>Gacanta ku jiid dhan walba · Soo dhawee</span>
          </div>

          <div
            data-panzoom-control="true"
            className="absolute right-2.5 bottom-2.5 z-20 flex items-end gap-1.5 print:hidden no-print"
          >
            {/* Compact 4-Direction Pan Pad + Center Reset */}
            <div className="grid grid-cols-3 gap-0.5 rounded-xl bg-[#060d18]/90 border border-[#223250] p-1 shadow-lg backdrop-blur-xs">
              <div />
              <button
                type="button"
                onClick={() => nudge(0, 72)}
                title="U riix kor"
                aria-label="U riix kor"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-[#a9b8d0] hover:text-[#e8eef7] hover:bg-[#111b2e] active:scale-95 cursor-pointer"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <div />

              <button
                type="button"
                onClick={() => nudge(72, 0)}
                title="U riix bidix"
                aria-label="U riix bidix"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-[#a9b8d0] hover:text-[#e8eef7] hover:bg-[#111b2e] active:scale-95 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={resetView}
                title="Ku celi dhexda (100%)"
                aria-label="Ku celi dhexda (100%)"
                className="h-7 w-7 rounded-lg flex items-center justify-center bg-[#111b2e] text-[#22c55e] hover:bg-[#16243d] active:scale-95 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => nudge(-72, 0)}
                title="U riix midig"
                aria-label="U riix midig"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-[#a9b8d0] hover:text-[#e8eef7] hover:bg-[#111b2e] active:scale-95 cursor-pointer"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>

              <div />
              <button
                type="button"
                onClick={() => nudge(0, -72)}
                title="U riix hoos"
                aria-label="U riix hoos"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-[#a9b8d0] hover:text-[#e8eef7] hover:bg-[#111b2e] active:scale-95 cursor-pointer"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <div />
            </div>

            {/* Vertical Zoom +/- Stack */}
            <div className="flex flex-col rounded-xl bg-[#060d18]/90 border border-[#223250] p-1 shadow-lg backdrop-blur-xs gap-0.5">
              <button
                type="button"
                onClick={zoomIn}
                title="Soo dhawee (Zoom In)"
                aria-label="Soo dhawee"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[#e8eef7] hover:bg-[#111b2e] hover:text-[#22c55e] active:scale-95 cursor-pointer"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={resetView}
                title="Ku-habbee 100%"
                aria-label="Ku-habbee 100%"
                className="h-6 px-1 rounded-md flex items-center justify-center text-[10px] font-mono-numbers tabular-nums font-bold text-[#22c55e] hover:bg-[#111b2e] cursor-pointer"
              >
                {Math.round(viewState.zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={zoomOut}
                title="Fogee (Zoom Out)"
                aria-label="Fogee"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[#e8eef7] hover:bg-[#111b2e] hover:text-[#22c55e] active:scale-95 cursor-pointer"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});
