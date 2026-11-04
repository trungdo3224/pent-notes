import React, { useMemo } from 'react';
import { Download, ExternalLink, FileText } from 'lucide-react';

interface PdfViewerProps {
  title: string;
  filePath?: string;
  pdfData?: string;
  className?: string;
}

function formatPdfFilename(title: string): string {
  return title.endsWith('.pdf') ? title : `${title}.pdf`;
}

function convertDataUrlToBlobUrl(dataUrl: string): string {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/pdf';
  const binaryStr = atob(parts[1]);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  title,
  filePath,
  pdfData,
  className = '',
}) => {
  const pdfUrl = useMemo(() => {
    if (pdfData) {
      return pdfData;
    }
    if (filePath) {
      if (typeof window !== 'undefined' && window.electronAPI?.fs?.getRawUrl) {
        return window.electronAPI.fs.getRawUrl(filePath);
      }
      return `/api/fs/raw?path=${encodeURIComponent(filePath)}`;
    }
    return '';
  }, [filePath, pdfData]);

  if (!pdfUrl) {
    return (
      <div className={`pdf-viewer-empty ${className}`}>
        <FileText size={42} strokeWidth={1.5} className="pdf-viewer-empty-icon" />
        <h3>PDF Source Unavailable</h3>
        <p>No valid file path or data found for this document.</p>
      </div>
    );
  }

  const displayFilename = formatPdfFilename(title);

  const handleOpenExternal = () => {
    if (pdfData) {
      try {
        window.open(convertDataUrlToBlobUrl(pdfData), '_blank');
        return;
      } catch {
        window.open(pdfUrl, '_blank');
        return;
      }
    }
    window.open(pdfUrl, '_blank');
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = displayFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`pdf-viewer-container ${className}`}>
      <div className="pdf-viewer-toolbar">
        <div className="pdf-viewer-info">
          <FileText size={15} className="pdf-badge-icon" />
          <span className="pdf-viewer-filename">{displayFilename}</span>
        </div>
        <div className="pdf-viewer-actions">
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
            title="Download PDF"
            aria-label="Download PDF"
          >
            <Download size={13} strokeWidth={1.8} />
            <span>Download</span>
          </button>
        </div>
      </div>

      <div className="pdf-frame-wrapper">
        <iframe
          src={`${pdfUrl}#toolbar=1&navpanes=1`}
          title={title}
          className="pdf-embedded-frame"
        />
      </div>
    </div>
  );
};

export default PdfViewer;
