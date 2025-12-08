import React from "react";
import "../../pages/AudioPage.css";

/**
 * DraggableDiv - Used as a consistent wrapper for draggable UI sections.
 */
const DraggableDiv = ({
  color = "",
  children,
  className = "",
  disableSectionPadding = false,
  ...props
}) => {
  // Build class list: conditionally include "section" class, add color, and custom classes
  const classes = [disableSectionPadding ? null : "section", color, className]
    .filter(Boolean) // Remove null/undefined values
    .join(" "); // Join into a single className string

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
};

export default DraggableDiv;
