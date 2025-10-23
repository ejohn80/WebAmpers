import React from 'react';
import DraggableDiv from '../Generic/DraggableDiv';

/**
 * Sidebar component for the application layout.
 * @param {object} props - The component props.
 * @param {number} props.width - The current width of the sidebar.
 */
function Sidebar({ width }) {
  return (
    <DraggableDiv color="blue" className="sidebar-container">
      **Sidebar** (Blue Section, Current Width: {Math.round(width)}px)
    </DraggableDiv>
  );
}

export default Sidebar;

