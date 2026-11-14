import React from "react";
import { ChevronRight, Folder } from "lucide-react";

interface NoteBreadcrumbProps {
  segments: string[];
  className?: string;
}

/**
 * Renders the workspace folder > subfolder > note breadcrumb trail.
 */
export const NoteBreadcrumb: React.FC<NoteBreadcrumbProps> = ({
  segments,
  className = "editor-breadcrumb",
}) => (
  <div className={className} aria-label="Note path">
    {segments.length > 0 && (
      <Folder size={13} strokeWidth={1.9} className="breadcrumb-icon" />
    )}
    {segments.map((segment, index) => (
      <React.Fragment key={`${segment}-${index}`}>
        {index > 0 && (
          <ChevronRight size={12} strokeWidth={2} className="breadcrumb-sep" />
        )}
        <span
          className={
            index === segments.length - 1
              ? "breadcrumb-current"
              : "breadcrumb-part"
          }
          title={segment}
        >
          {segment}
        </span>
      </React.Fragment>
    ))}
  </div>
);
