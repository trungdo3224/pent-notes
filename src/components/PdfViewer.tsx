import React, { useMemo } from 'react';
import { Download, ExternalLink, FileText } from 'lucide-react';

interface PdfViewerProps {
  title: string;
  filePath?: string;
  pdfData?: string;
  className?: string;
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

  const handleOpenExternal = () => {
    if (pdfData) {
      // For data URL, convert to Blob URL to avoid browser URL length limits
      try {
        const arr = pdfData.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/pdf';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        return;
      } catch {
        window.open(pdfUrl, '_blank');
        return;
      }
    }
    window.open(pdfUrl, '_blank');
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = title.endsWith('.pdf') ? title : `${title}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className={`pdf-viewer-container ${className}`}>
      <div className="pdf-viewer-toolbar">
        <div className="pdf-viewer-info">
          <FileText size={15} className="pdf-badge-icon" />
          <span className="pdf-viewer-filename">{title.endsWith('.pdf') ? title : `${title}.pdf`}</span>
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

