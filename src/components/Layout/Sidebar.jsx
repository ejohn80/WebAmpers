import {useState, useEffect, useContext} from "react";
import DraggableDiv from "../Generic/DraggableDiv";
import {AppContext} from "../../context/AppContext";
import AssetsTab from "./Sidebar/AssetsTab";
import EffectsTab from "./Sidebar/EffectsTab";
import SessionsTab from "./Sidebar/SessionsTab";
// import styles from './Layout.module.css';

/**
 * Sidebar component for the application layout.
 * @param {object} props - The component props.
 * @param {number} props.width - The current width of the sidebar.
 * @param {function} props.onImportSuccess - Callback for successful audio import.
 * @param {function} props.onImportError - Callback for failed audio import.
 * @param {function} props.onAssetDelete - Callback for asset deletion.
 * @param {number} props.assetsRefreshTrigger - Counter to trigger assets reload.
 * @param {Map} props.assetBufferCache - Cache for shared audio buffers.
 */
function Sidebar({
  width,
  onImportSuccess,
  onImportError,
  onAssetDelete,
  assetsRefreshTrigger,
  assetBufferCache,
}) {
  const [currentTab, setCurrentTab] = useState("sessions");

  const tabs = {
    sessions: {
      label: "Sessions",
      component: <SessionsTab />,
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
          onAssetDelete={onAssetDelete}
          refreshTrigger={assetsRefreshTrigger}
          assetBufferCache={assetBufferCache}
        />
      ),
    },
  };

  const handleTabClick = (key) => {
    setCurrentTab(key);
  };

  return (
    <DraggableDiv color="1E1D20" className="sidebar-container">
      <div style={{display: "flex", marginBottom: "10px", borderRadius: "8px"}}>
        {Object.entries(tabs).map(([key, tab]) => (
          <button
            key={key}
            onClick={() => handleTabClick(key)}
            style={{
              flex: 1,
              padding: "10px 0",
              border: "none",
              background: currentTab === key ? "#17E1FF" : "#193338",
              color: currentTab === key ? "#193338" : "#17E1FF",
              fontWeight: currentTab === key ? "bold" : "bold",
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
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
