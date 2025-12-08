/**
 * Sidebar component for the application layout.
 * Provides collapsible sidebar with tabs for Assets, Effects, and Sessions management.
 * @param {function} props.onImportSuccess - Callback for successful audio import.
 * @param {function} props.onImportError - Callback for failed audio import.
 * @param {function} props.onAssetDelete - Callback for asset deletion.
 * @param {number} props.assetsRefreshTrigger - Counter to trigger assets reload.
 * @param {Map} props.assetBufferCache - Cache for shared audio buffers.
 * @param {number} props.width - Current width of the sidebar (can be 0 when collapsed).
 */

import {useState, useEffect, useContext} from "react";
import DraggableDiv from "../Generic/DraggableDiv";
import AssetsTab from "./Sidebar/AssetsTab";
import EffectsTab from "./Sidebar/EffectsTab";
import SessionsTab from "./Sidebar/SessionsTab";
import {AppContext} from "../../context/AppContext";
import "./Sidebar.css";

// Local storage key for persisting the active tab selection
const SIDEBAR_TAB_KEY = "webamp.sidebarTab";

// Retrieve initial tab from localStorage, defaulting to "assets"
const getInitialTab = () => {
  // Guard against server-side rendering where localStorage isn't available
  if (
    typeof window === "undefined" ||
    typeof window.localStorage === "undefined"
  ) {
    return "assets";
  }

  try {
    const stored = window.localStorage.getItem(SIDEBAR_TAB_KEY);
    return stored || "assets"; // Default to assets tab if nothing stored
  } catch {
    return "assets"; // Fallback if localStorage access fails
  }
};

function Sidebar({
  onImportSuccess,
  onImportError,
  onAssetDelete,
  assetsRefreshTrigger,
  assetBufferCache,
  width = 0,
}) {
  // State for the currently active tab
  const [currentTab, setCurrentTab] = useState(getInitialTab);

  // Access closeEffectsMenu function from AppContext to close effects menu when needed
  const {closeEffectsMenu} = useContext(AppContext);

  // Ensure width is a valid number and at least 0
  const clampedWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  const isCollapsed = clampedWidth <= 0; // Sidebar is considered collapsed when width is 0 or less

  // Tab configuration - defines available tabs and their components
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

  // Handle tab click - switches tabs and closes effects menu if needed
  const handleTabClick = (key) => {
    // Close effects menu when switching to any tab except effects
    if (key !== "effects") {
      closeEffectsMenu();
    }
    setCurrentTab(key);
  };

  // Persist tab selection to localStorage whenever currentTab changes
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
    <DraggableDiv
      color="1E1D20" // Background color for draggable component
      className={`sidebar-container${isCollapsed ? " is-collapsed" : ""}`} // Add collapsed class when width is 0
      style={{
        width: `${clampedWidth}px`,
        minWidth: `${clampedWidth}px`, // Ensure width doesn't shrink below clamped value
        padding: isCollapsed ? 0 : undefined, // Remove padding when collapsed
      }}
      aria-hidden={isCollapsed} // Hide from screen readers when collapsed
      data-collapsed={isCollapsed ? "true" : undefined} // Data attribute for CSS targeting
    >
      {/* Tab navigation buttons */}
      <div className="sidebar-tabs">
        {tabs.map(({key, label}, index) => (
          <button
            key={key}
            type="button"
            onClick={() => handleTabClick(key)}
            className={`sidebar-tab-button${
              currentTab === key ? " is-active" : "" // Add active class for current tab
            }${index === 0 ? " is-first" : ""}${
              index === tabs.length - 1 ? " is-last" : "" // Add first/last classes for styling
            }`}
            aria-pressed={currentTab === key} // Accessibility attribute
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content area */}
      <div>
        {tabs.map(({key, component}) => (
          <div
            key={key}
            style={{display: currentTab === key ? "block" : "none"}} // Only show active tab's content
          >
            {component}
          </div>
        ))}
      </div>
    </DraggableDiv>
  );
}

export default Sidebar;
