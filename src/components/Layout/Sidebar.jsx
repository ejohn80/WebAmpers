/**
 * Sidebar Component
 *
 * Main application sidebar with tabbed navigation for Assets, Effects, and Sessions.
 * Provides draggable interface and integrates with AppContext for effects menu management.
 */

import {useState, useEffect, useContext} from "react";
import DraggableDiv from "../Generic/DraggableDiv";
import AssetsTab from "./Sidebar/AssetsTab";
import EffectsTab from "./Sidebar/EffectsTab";
import SessionsTab from "./Sidebar/SessionsTab";
import {AppContext} from "../../context/AppContext";
import "./Sidebar.css";

// Key for storing sidebar tab preference in localStorage
const SIDEBAR_TAB_KEY = "webamp.sidebarTab";

/**
 * Retrieves the initial active tab from localStorage
 * Defaults to "assets" if no preference is stored
 */
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
  // State for currently active tab
  const [currentTab, setCurrentTab] = useState(getInitialTab);

  // Access AppContext to close effects menu when needed
  const {closeEffectsMenu} = useContext(AppContext);

  // Tab definitions - each maps to a component
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

  /**
   * Handles tab selection with side effect of closing effects menu
   * @param {string} key - The tab key to switch to
   */
  const handleTabClick = (key) => {
    // Close effects menu when switching to any tab except effects
    if (key !== "effects") {
      closeEffectsMenu();
    }
    setCurrentTab(key);
  };

  // Persist tab selection to localStorage when it changes
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
      {/* Tab Navigation Buttons */}
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

      {/* Tab Content Area */}
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
