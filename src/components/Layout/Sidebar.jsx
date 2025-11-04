import { useState, useEffect, useContext } from 'react';
import DraggableDiv from '../Generic/DraggableDiv';
import { AppContext } from '../../context/AppContext';

import styles from './Layout.module.css';

import AssetsTab from './Sidebar/AssetsTab';
import EffectsTab from './Sidebar/EffectsTab';
import ProjectsTab from './Sidebar/ProjectsTab';

/**
 * Sidebar component for the application layout.
 * @param {object} props - The component props.
 * @param {number} props.width - The current width of the sidebar.
 * @param {function} props.onImportSuccess - Callback for successful audio import.
 * @param {function} props.onImportError - Callback for failed audio import.
 */
function Sidebar({ width, onImportSuccess, onImportError }) {
  const { userData } = useContext(AppContext);
  const [currentTab, setCurrentTab] = useState("projects");

  // Redirect to projects tab if user logs out
  useEffect(() => {
    if (!userData) {
      setCurrentTab("projects");
    }
  }, [userData]);

  const tabs = {
    projects: {
      label: 'Projects',
      component: <ProjectsTab />,
    },
    effects: {
      label: 'Effects',
      component: <EffectsTab />,
    },
    assets: {
      label: 'Assets',
      component: <AssetsTab onImportSuccess={onImportSuccess} onImportError={onImportError} />,
    },
  };

  const handleTabClick = (key) => {
    // Only allow tab switching if user is logged in
    if (userData) {
      setCurrentTab(key);
    }
  };

  return (
    <DraggableDiv color="1E1D20" className="sidebar-container">
      <div style={{ display: 'flex', marginBottom: '10px', borderRadius: '8px' }}>
        {Object.entries(tabs).map(([key, tab]) => (
          <button
            key={key}
            onClick={() => handleTabClick(key)}
            disabled={!userData && key !== 'projects'}
            style={{
              flex: 1,
              padding: '10px 0',
              border: 'none',
              background: currentTab === key ? '#00e5ff' : '#1a1a1a',
              color: currentTab === key ? '#000' : '#00e5ff',
              fontWeight: currentTab === key ? 'bold' : 'normal',
              cursor: userData || key === 'projects' ? 'pointer' : 'not-allowed',
              opacity: !userData && key !== 'projects' ? 0.5 : 1,
              transition: 'background 0.2s, color 0.2s, opacity 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>{tabs[currentTab].component}</div>
    </DraggableDiv>
  );
}

export default Sidebar;