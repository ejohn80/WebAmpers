import React from "react";
import "../../pages/AudioPage.css";

const DraggableDiv = ({
  color = "",
  children,
  className = "",
  disableSectionPadding = false,
  ...props
}) => {
  const classes = [disableSectionPadding ? null : "section", color, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
};

export default DraggableDiv;
