import React from 'react';
import '../../pages/AudioPage.css';

const DraggableDiv = ({ color, children, className, ...props }) => (
  <div className={`section ${color} ${className || ''}`} {...props}>
    {children}
  </div>
);

export default DraggableDiv;