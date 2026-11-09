import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Download,
  ExternalLink,
  Image as ImageIcon,
  Maximize2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

export interface ImageViewerProps {
  title: string;
  filePath?: string;
  imageUrl?: string;
  imageData?: string;
  className?: string;
  onClose?: () => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

function resolveDisplayFilename(title: string, filePath?: string): string {
  if (filePath) {
    const base = filePath.split(/[\\/]/).pop();
    if (base) return base;
  }
  return title || "Image";
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
  title,
  filePath,
  imageUrl,
  imageData,
  className = "",
  onClose,
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const resolvedSrc = useMemo(() => {
    if (imageUrl) return imageUrl;
    if (imageData) return imageData;
    if (filePath) {
      if (typeof window !== "undefined" && window.electronAPI?.fs?.getRawUrl) {
        return window.electronAPI.fs.getRawUrl(filePath);
      }
      return `/api/fs/raw?path=${encodeURIComponent(filePath)}`;
    }
    return "";
  }, [filePath, imageData, imageUrl]);

  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    setHasError(false);
    setDimensions(null);
  }, [resolvedSrc]);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => clampZoom(prev + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const next = clampZoom(prev - ZOOM_STEP);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setZoom((prev) => {
      const next = clampZoom(prev + delta);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    },
    [pan.x, pan.y],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const displayFilename = resolveDisplayFilename(title, filePath);

  const handleOpenExternal = () => {
    if (!resolvedSrc) return;
    window.open(resolvedSrc, "_blank");
  };

  const handleDownload = () => {
    if (!resolvedSrc) return;
    const link = document.createElement("a");
    link.href = resolvedSrc;
    link.download = displayFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!resolvedSrc || hasError) {
    return (
      <div className={`pdf-viewer-empty ${className}`}>
        <ImageIcon
          size={42}
          strokeWidth={1.5}
          className="pdf-viewer-empty-icon"
        />
        <h3>Image Source Unavailable</h3>
        <p>No valid image path or data found for this file.</p>
      </div>
    );
  }

  return (
    <div className={`image-viewer-container ${className}`}>
      <div className="pdf-viewer-toolbar image-viewer-toolbar">
        <div className="pdf-viewer-info">
          <ImageIcon size={15} className="image-badge-icon" />
          <span className="pdf-viewer-filename" title={displayFilename}>
            {displayFilename}
          </span>
          {dimensions && (
            <span className="image-viewer-dimensions">
              {dimensions.width} × {dimensions.height}
            </span>
          )}
        </div>

        <div className="pdf-viewer-actions">
          <div className="image-viewer-zoom-group">
            <button
              type="button"
              className="pdf-tool-btn is-icon-only"
              onClick={handleZoomOut}
              disabled={zoom <= MIN_ZOOM}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut size={13} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className="pdf-tool-btn image-viewer-zoom-readout"
              onClick={handleResetView}
              title="Reset zoom to 100%"
              aria-label="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="pdf-tool-btn is-icon-only"
              onClick={handleZoomIn}
              disabled={zoom >= MAX_ZOOM}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn size={13} strokeWidth={1.8} />
            </button>
          </div>

          <button
            type="button"
            className="pdf-tool-btn is-icon-only"
            onClick={handleResetView}
            title="Fit to screen"
            aria-label="Fit to screen"
          >
            <Maximize2 size={13} strokeWidth={1.8} />
          </button>

          <button
            type="button"
            className="pdf-tool-btn is-icon-only"
            onClick={handleRotate}
            title="Rotate 90°"
            aria-label="Rotate 90 degrees"
          >
            <RotateCw size={13} strokeWidth={1.8} />
          </button>

          <button
            type="button"
            className="pdf-tool-btn"
            onClick={handleOpenExternal}
            title="Open in new window / tab"
            aria-label="Open in new window"
          >
            <ExternalLink size={13} strokeWidth={1.8} />
            <span>Open in Tab</span>
          </button>

          <button
            type="button"
            className="pdf-tool-btn"
            onClick={handleDownload}
            title="Download image"
            aria-label="Download image"
          >
            <Download size={13} strokeWidth={1.8} />
            <span>Download</span>
          </button>

          {onClose && (
            <button
              type="button"
              className="pdf-tool-btn is-icon-only image-viewer-close-btn"
              onClick={onClose}
              title="Close viewer (Esc)"
              aria-label="Close viewer"
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      <div
        className={`image-viewer-stage ${isDragging ? "is-dragging" : ""}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => {
          if (zoom !== 1) {
            handleResetView();
          } else {
            setZoom(2);
          }
        }}
      >
        <img
          src={resolvedSrc}
          alt={title}
          className="image-viewer-img"
          draggable={false}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom}) rotate(${rotation}deg)`,
          }}
          onLoad={(e) => {
            const target = e.currentTarget;
            if (target.naturalWidth && target.naturalHeight) {
              setDimensions({
                width: target.naturalWidth,
                height: target.naturalHeight,
              });
            }
          }}
          onError={() => setHasError(true)}
        />
      </div>
    </div>
  );
};
