import {useState, useEffect, useContext} from "react";
import DraggableDiv from "../Generic/DraggableDiv";
import AssetsTab from "./Sidebar/AssetsTab";
import EffectsTab from "./Sidebar/EffectsTab";
import SessionsTab from "./Sidebar/SessionsTab";
import {AppContext} from "../../context/AppContext";
import "./Sidebar.css";

/**
 * Sidebar component for the application layout.
 * @param {function} props.onImportSuccess - Callback for successful audio import.
 * @param {function} props.onImportError - Callback for failed audio import.
 * @param {function} props.onAssetDelete - Callback for asset deletion.
 * @param {number} props.assetsRefreshTrigger - Counter to trigger assets reload.
 * @param {Map} props.assetBufferCache - Cache for shared audio buffers.
 */
const SIDEBAR_TAB_KEY = "webamp.sidebarTab";

const getInitialTab = () => {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage === "undefined"
  ) {
    return "assets";
  }

  try {
    const stored = window.localStorage.getItem(SIDEBAR_TAB_KEY);
    return stored || "assets";
  } catch {
    return "assets";
  }
};

function Sidebar({
  onImportSuccess,
  onImportError,
  onAssetDelete,
  assetsRefreshTrigger,
  assetBufferCache,
}) {
  const [currentTab, setCurrentTab] = useState(getInitialTab);
  const {closeEffectsMenu} = useContext(AppContext); // Get closeEffectsMenu from context

  const tabs = [
    {
      key: "assets",
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
    {
      key: "effects",
      label: "Effects",
      component: <EffectsTab />,
    },
    {
      key: "sessions",
      label: "Sessions",
      component: <SessionsTab />,
    },
  ];

  const handleTabClick = (key) => {
    // Close effects menu when switching to any tab except effects
    if (key !== "effects") {
      closeEffectsMenu();
    }
    setCurrentTab(key);
  };

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(SIDEBAR_TAB_KEY, currentTab);
      }
    } catch (error) {
      console.warn("Failed to persist sidebar tab selection:", error);
    }
  }, [currentTab]);

  return (
    <DraggableDiv color="1E1D20" className="sidebar-container">
      <div style={{display: "flex", marginBottom: "10px", borderRadius: "8px"}}>
        {tabs.map(({key, label}) => (
          <button
            key={key}
            onClick={() => handleTabClick(key)}
            style={{
              flex: 1,
              padding: "10px 0",
              border: "none",
              background:
                currentTab === key
                  ? "var(--sidebar-tab-active-bg, #17E1FF)"
                  : "var(--sidebar-tab-bg, #193338)",
              color:
                currentTab === key
                  ? "var(--sidebar-tab-active-text, #193338)"
                  : "var(--sidebar-tab-text, #17E1FF)",
              fontWeight: currentTab === key ? "bold" : "bold",
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        {tabs.map(({key, component}) => (
          <div
            key={key}
            style={{display: currentTab === key ? "block" : "none"}}
          >
            {component}
          </div>
        ))}
      </div>
    </DraggableDiv>
  );
}

export default Sidebar;
