import {useState, useEffect, useContext} from "react";
import DraggableDiv from "../Generic/DraggableDiv";
import {AppContext} from "../../context/AppContext";
import AssetsTab from "./Sidebar/AssetsTab";
import EffectsTab from "./Sidebar/EffectsTab";
import ProjectsTab from "./Sidebar/ProjectsTab";
// import styles from './Layout.module.css';

/**
 * Sidebar component for the application layout.
 * @param {object} props - The component props.
 * @param {number} props.width - The current width of the sidebar.
 * @param {function} props.onImportSuccess - Callback for successful audio import.
 * @param {function} props.onImportError - Callback for failed audio import.
 */
function Sidebar({width, onImportSuccess, onImportError}) {
  const {userData} = useContext(AppContext);
  const [currentTab, setCurrentTab] = useState("projects");

  // If logged out, only redirect away from Assets (Effects/Projects stay allowed)
  useEffect(() => {
    if (!userData && currentTab === "assets") {
      setCurrentTab("effects");
    }
  }, [userData, currentTab]);

  const tabs = {
    projects: {
      label: "Projects",
      component: <ProjectsTab />,
    },
    effects: {
      label: "Effects",
      component: <EffectsTab />,
    },
    assets: {
      label: "Assets",
      component: (
        <AssetsTab
          onImportSuccess={onImportSuccess}
          onImportError={onImportError}
        />
      ),
    },
  };

  const handleTabClick = (key) => {
    // Allow Effects and Projects even when not logged in; keep Assets gated
    if (userData || key !== "assets") {
      setCurrentTab(key);
    }
  };

  return (
    <DraggableDiv color="1E1D20" className="sidebar-container">
      <div style={{display: "flex", marginBottom: "10px", borderRadius: "8px"}}>
        {Object.entries(tabs).map(([key, tab]) => (
          <button
            key={key}
            onClick={() => handleTabClick(key)}
            disabled={!userData && key === "assets"}
            style={{
              flex: 1,
              padding: "10px 0",
              border: "none",
              background: currentTab === key ? "#17E1FF" : "#193338",
              color: currentTab === key ? "#193338" : "#17E1FF",
              fontWeight: currentTab === key ? "bold" : "bold",
              cursor: userData || key !== "assets" ? "pointer" : "not-allowed",
              opacity: !userData && key === "assets" ? 0.5 : 1,
              transition: "background 0.2s, color 0.2s, opacity 0.2s",
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
