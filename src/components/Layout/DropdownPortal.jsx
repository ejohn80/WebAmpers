/**
 * DropdownPortal Component
 *
 * Main header navigation with dropdown menus (File, Edit, Tools, Settings, User).
 * Uses React portals for proper overlay behavior and z-index handling.
 *
 * Features:
 * - Portal-rendered dropdowns with click-outside close behavior
 * - Fullscreen toggle (cross-browser)
 * - Light/Dark theme switch
 * - Tool access (Equalizer, Sampler)
 * - Audio import/export (with success/error callbacks)
 * - Track editing: Cut/Copy/Paste/Delete
 * - Conditional UI based on auth state
 * - Cloud save/load for authenticated users
 *
 * Props:
 * @param {string} side — Position ("left" or "right")
 * @param {Array} tracks — Audio track list (validates export availability)
 * @param {number} totalLengthMs — Total audio duration
 * @param {function} onExportComplete
 * @param {function} onImportSuccess
 * @param {function} onImportError
 * @param {function} onCutTrack
 * @param {function} onCopyTrack
 * @param {function} onPasteTrack
 * @param {function} onDeleteTrack
 * @param {string|null} selectedTrackId
 * @param {boolean} hasClipboard
 * @param {function} onSamplerRecording
 *
 * Dependencies:
 * - AppContext (auth, theme, session, effects)
 * - react-router-dom (navigation)
 * - Icon components (./Svgs)
 * - Tools: Equalizer, Sampler, AudioExportButton, AudioImportButton
 */
import React, {useState, useEffect, useRef, useContext} from "react";
import {logout} from "../Auth/AuthUtils";
import {AppContext} from "../../context/AppContext";
import ReactDOM from "react-dom";
import {useNavigate} from "react-router-dom";

import AudioExportButton from "../AudioExport/AudioExportButton";
import AudioImportButton from "../AudioImport/AudioImportButton";
import Equalizer from "../Tools/Equalizer";
import Sampler from "../Tools/Sampler";
import SaveLoadModal from "../../CloudSaving/SaveLoadModal";

import "./Header.css";
import {
  ExportIcon,
  ImportIcon,
  CutIcon,
  CopyIcon,
  PasteIcon,
  DeleteIcon,
  ThemesIcon,
  GuestIcon,
} from "./Svgs";

import {BsArrowsFullscreen, BsArrowsAngleContract} from "react-icons/bs";

function DropdownPortal({
  side,
  tracks,
  totalLengthMs,
  onExportComplete,
  onImportSuccess,
  onImportError,
  onCutTrack,
  onCopyTrack,
  onPasteTrack,
  onDeleteTrack,
  selectedTrackId,
  hasClipboard,
  onSamplerRecording,
}) {
  // ================================
  // Hooks and Context
  // ================================

  /**
   * Navigation hook for redirecting to login/register pages
   */
  const navigate = useNavigate();

  /**
   * Application context providing user data, theme, and session management
   * closeEffectsMenu: Function to close any open effects panels when menu is interacted with
   */
  const {userData, closeEffectsMenu, setActiveSession, theme, setTheme} =
    useContext(AppContext);

  // ================================
  // State Management
  // ================================

  /**
   * Currently active dropdown menu (null if none)
   * Possible values: "file", "edit", "tools", "settings", "guest"
   */
  const [activeDropdown, setActiveDropdown] = useState(null);

  /**
   * Currently active submenu within a dropdown (null if none)
   * Currently used for "themes" submenu
   */
  const [activeSubmenu, setActiveSubmenu] = useState(null);

  /**
   * Screen coordinates for positioning dropdowns relative to their trigger buttons
   */
  const [position, setPosition] = useState({top: 0, left: 0});

  /**
   * Modal and tool states
   */
  const [isFullscreen, setIsFullscreen] = useState(false); // Tracks fullscreen state
  const [isEQOpen, setIsEQOpen] = useState(false); // Equalizer modal visibility
  const [isSamplerOpen, setIsSamplerOpen] = useState(false); // Sampler modal visibility
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false); // Save modal visibility
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false); // Load modal visibility

  /**
   * Tooltip state for displaying hints on disabled menu items
   */
  const [tooltip, setTooltip] = useState({show: false, text: "", x: 0, y: 0});

  // ================================
  // DOM References
  // ================================

  /**
   * References to menu button elements for calculating dropdown positions
   */
  const fileButtonRef = useRef(null);
  const editButtonRef = useRef(null);
  const toolsButtonRef = useRef(null);
  const settingsButtonRef = useRef(null);
  const guestButtonRef = useRef(null);

  /**
   * References to dropdown container elements for click-outside detection
   */
  const fileDropdownRef = useRef(null);
  const editDropdownRef = useRef(null);
  const toolsDropdownRef = useRef(null);
  const settingsDropdownRef = useRef(null);
  const guestDropdownRef = useRef(null);

  // ================================
  // Derived Values
  // ================================

  /**
   * Determines if export functionality should be enabled
   * Export requires at least one audio track to be present
   */
  const hasTracksForExport = tracks && tracks.length > 0;

  // ================================
  // Event Handlers - Menu Actions
  // ================================

  /**
   * Handles menu item selection and navigation
   * @param {string} action - The action identifier (e.g., "Login", "Register")
   */
  const handleMenuItemClick = (action) => {
    console.log(`Selected: ${action}`);

    // Navigation actions
    if (action === "Login") {
      navigate("/login");
    } else if (action === "Register") {
      navigate("/register");
    }

    // Close dropdown for all actions except Import/Export
    // Import/Export are handled by their wrapper components
    if (action !== "Import" && action !== "Export") {
      setActiveDropdown(null);
    }
  };

  /**
   * Handles dropdown button clicks - toggles dropdown visibility
   * @param {string} dropdownName - Identifier for which dropdown to toggle
   * @param {React.RefObject} buttonRef - Reference to the clicked button element
   */
  const handleButtonClick = (dropdownName, buttonRef) => {
    // Close any open effects menu when header button is clicked
    closeEffectsMenu();

    // Calculate dropdown position based on button location
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      });
    }

    // Toggle dropdown: open if closed, close if already open
    setActiveDropdown(activeDropdown === dropdownName ? null : dropdownName);
  };

  /**
   * Handles mouse leaving dropdown area - closes dropdown if mouse completely exits
   * @param {MouseEvent} event - The mouse leave event
   */
  const handleDropdownMouseLeave = (event) => {
    const relatedTarget = event.relatedTarget;
    const dropdown = event.currentTarget;

    // Only close if mouse left the dropdown entirely (not just moving between child elements)
    if (!dropdown.contains(relatedTarget)) {
      setActiveDropdown(null);
    }
  };

  // ================================
  // Event Handlers - Edit Operations
  // ================================

  /**
   * Handles cut operation on selected track
   * @param {Event} e - Click event
   */
  const handleCut = (e) => {
    e.preventDefault();
    if (!selectedTrackId) return; // Require track selection
    onCutTrack?.();
    setActiveDropdown(null); // Close dropdown after action
  };

  /**
   * Handles copy operation on selected track
   * @param {Event} e - Click event
   */
  const handleCopy = (e) => {
    e.preventDefault();
    if (!selectedTrackId) return; // Require track selection
    onCopyTrack?.();
    setActiveDropdown(null); // Close dropdown after action
  };

  /**
   * Handles paste operation from clipboard
   * @param {Event} e - Click event
   */
  const handlePaste = (e) => {
    e.preventDefault();
    if (!hasClipboard) return; // Require clipboard data
    onPasteTrack?.();
    setActiveDropdown(null); // Close dropdown after action
  };

  // ================================
  // Event Handlers - Tooltips
  // ================================

  /**
   * Shows tooltip when hovering over disabled menu items
   * @param {string} text - Tooltip text to display
   * @param {MouseEvent} event - Mouse enter event for positioning
   */
  const handleMouseEnter = (text, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      show: true,
      text,
      x: rect.left + rect.width / 2, // Center tooltip horizontally
      y: rect.bottom + 5, // Position just below element
    });
  };

  /**
   * Hides tooltip when mouse leaves element
   */
  const handleMouseLeave = () => {
    setTooltip({show: false, text: "", x: 0, y: 0});
  };

  /**
   * Handles delete operation on selected track
   * @param {Event} e - Click event
   */
  const handleDelete = (e) => {
    e.preventDefault();
    if (!selectedTrackId) return; // Require track selection
    onDeleteTrack?.(selectedTrackId);
    setActiveDropdown(null); // Close dropdown after action
  };

  // ================================
  // Effects & Side Effects
  // ================================

  /**
   * Effect: Sets up click-outside detection for closing dropdowns
   * Listens for clicks anywhere in document and closes dropdown if click is outside
   * both the dropdown and its trigger button
   */
  useEffect(() => {
    function handleClickOutside(event) {
      // Map dropdown names to their refs for easy lookup
      const dropdownRefs = {
        file: fileDropdownRef,
        edit: editDropdownRef,
        tools: toolsDropdownRef,
        settings: settingsDropdownRef,
        guest: guestDropdownRef,
      };

      const buttonRefs = {
        file: fileButtonRef,
        edit: editButtonRef,
        tools: toolsButtonRef,
        settings: settingsButtonRef,
        guest: guestButtonRef,
      };

      const activeRef = dropdownRefs[activeDropdown];
      const activeButtonRef = buttonRefs[activeDropdown];

      // Close dropdown if click is outside both dropdown and its trigger button
      if (
        activeRef &&
        activeRef.current &&
        !activeRef.current.contains(event.target) &&
        activeButtonRef &&
        activeButtonRef.current &&
        !activeButtonRef.current.contains(event.target)
      ) {
        setActiveDropdown(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activeDropdown]); // Re-run effect when activeDropdown changes

  /**
   * Effect: Sets up fullscreen change listeners
   * Updates isFullscreen state when browser enters/exits fullscreen mode
   */
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(checkFullscreen());
    };

    // Add listeners for all browser-specific fullscreen events
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      // Clean up all listeners
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "MSFullscreenChange",
        handleFullscreenChange
      );
    };
  }, []); // Empty dependency array - runs once on mount

  /**
   * Effect: Clears active submenu when dropdown closes
   * Ensures submenus don't remain open when parent dropdown closes
   */
  useEffect(() => {
    if (!activeDropdown) {
      setActiveSubmenu(null);
    }
  }, [activeDropdown]);

  // ================================
  // Helper Functions - UI
  // ================================

  /**
   * Generates CSS class for dropdown buttons with active state
   * @param {string} buttonType - Optional button type suffix for styling
   * @param {string} dropdownName - Name of the dropdown this button controls
   * @returns {string} CSS class string with active state if applicable
   */
  const getButtonClass = (buttonType, dropdownName) => {
    const baseClass = `dropdown-btn${buttonType ? `-${buttonType}` : ""}`;
    return activeDropdown === dropdownName ? `${baseClass} active` : baseClass;
  };

  // ================================
  // Helper Functions - Fullscreen
  // ================================

  /**
   * Enters fullscreen mode using browser-specific APIs
   */
  const enterFullScreen = () => {
    let element = document.documentElement;
    setIsFullscreen(true);

    // Try all browser-specific fullscreen APIs
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.mozRequestFullScreen) {
      // Firefox
      element.mozRequestFullScreen();
    } else if (element.webkitRequestFullscreen) {
      // Chrome, Safari, and Opera
      element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
      // IE/Edge
      element.msRequestFullscreen();
    }
  };

  /**
   * Exits fullscreen mode using browser-specific APIs
   */
  const exitFullscreen = () => {
    setIsFullscreen(false);
    if (document.exitFullscreen) {
      // General
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      // Safari
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      // IE11
      document.msExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      // Firefox
      document.mozCancelFullScreen();
    }
  };

  /**
   * Checks if document is currently in fullscreen mode
   * @returns {boolean} True if in fullscreen, false otherwise
   */
  const checkFullscreen = () => {
    return Boolean(
      document.fullscreenElement || // Standard
        document.webkitFullscreenElement || // Chrome and Opera
        document.mozFullScreenElement || // Firefox
        document.msFullscreenElement // IE/Edge
    );
  };

  // ================================
  // Configuration Data
  // ================================

  /**
   * Theme options for the theme selection submenu
   */
  const themeOptions = [
    {id: "dark", label: "Dark Mode"},
    {id: "light", label: "Light Mode"},
  ];

  // ================================
  // Dropdown Content Definitions
  // ================================

  /**
   * JSX content for each dropdown menu
   * Each dropdown is defined as a separate component for clarity
   */
  const dropdownContent = {
    /**
     * File menu: Save, Load, Import Audio, Export Audio
     * Conditionally enabled based on user authentication and track availability
     */
    file: (
      <div
        ref={fileDropdownRef}
        className="dropdown-content dropdown-content-file"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          zIndex: 99999, // High z-index for overlay
        }}
        onMouseLeave={handleDropdownMouseLeave}
      >
        {/* Save option - disabled for guest users */}
        <a
          href="#"
          className={!userData ? "dropdown-item-disabled" : ""}
          onClick={(e) => {
            e.preventDefault();
            if (!userData) return; // Only for authenticated users
            setIsSaveModalOpen(true);
            setActiveDropdown(null);
          }}
        >
          <span>Save</span>
        </a>

        {/* Load option - disabled for guest users */}
        <a
          href="#"
          className={!userData ? "dropdown-item-disabled" : ""}
          onClick={(e) => {
            e.preventDefault();
            if (!userData) return; // Only for authenticated users
            setIsLoadModalOpen(true);
            setActiveDropdown(null);
          }}
        >
          <span>Load</span>
        </a>

        {/* Import Audio - always enabled, wrapped in AudioImportButton component */}
        <AudioImportButton
          onImportSuccess={onImportSuccess}
          onImportError={onImportError}
        >
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handleMenuItemClick("Import");
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                gap: "8px",
              }}
            >
              <ImportIcon />
              <span>Import Audio</span>
            </span>
          </a>
        </AudioImportButton>

        {/* Export Audio - conditionally enabled based on track availability */}
        <AudioExportButton
          tracks={tracks}
          totalLengthMs={totalLengthMs}
          onExportComplete={onExportComplete}
        >
          <a
            href="#"
            className={!hasTracksForExport ? "dropdown-item-disabled" : ""}
            onClick={(e) => {
              e.preventDefault();
              if (!hasTracksForExport) {
                alert(
                  "Please import audio or create a recording before exporting"
                );
                return;
              }
              handleMenuItemClick("Export");
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                gap: "8px",
              }}
            >
              <ExportIcon />
              <span>Export</span>
            </span>
          </a>
        </AudioExportButton>
      </div>
    ),

    /**
     * Edit menu: Cut, Copy, Paste, Delete
     * Conditionally enabled based on track selection and clipboard state
     */
    edit: (
      <div
        ref={editDropdownRef}
        className="dropdown-content dropdown-content-edit"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
        }}
        onMouseLeave={handleDropdownMouseLeave}
      >
        {/* Cut - requires track selection */}
        <a
          href="#"
          className={!selectedTrackId ? "dropdown-item-disabled" : ""}
          onClick={handleCut}
          onMouseEnter={(e) =>
            !selectedTrackId &&
            handleMouseEnter("Please select a track first", e)
          }
          onMouseLeave={handleMouseLeave}
          style={{
            cursor: selectedTrackId ? "pointer" : "not-allowed",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              gap: "8px",
            }}
          >
            <CutIcon />
            <span>Cut</span>
          </span>
        </a>

        {/* Copy - requires track selection */}
        <a
          href="#"
          className={!selectedTrackId ? "dropdown-item-disabled" : ""}
          onClick={handleCopy}
          onMouseEnter={(e) =>
            !selectedTrackId &&
            handleMouseEnter("Please select a track first", e)
          }
          onMouseLeave={handleMouseLeave}
          style={{
            cursor: selectedTrackId ? "pointer" : "not-allowed",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              gap: "8px",
            }}
          >
            <CopyIcon />
            <span>Copy</span>
          </span>
        </a>

        {/* Paste - requires clipboard data */}
        <a
          href="#"
          className={!hasClipboard ? "dropdown-item-disabled" : ""}
          onClick={handlePaste}
          onMouseEnter={(e) =>
            !hasClipboard && handleMouseEnter("No track copied or cut", e)
          }
          onMouseLeave={handleMouseLeave}
          style={{
            cursor: hasClipboard ? "pointer" : "not-allowed",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              gap: "8px",
            }}
          >
            <PasteIcon />
            <span>Paste</span>
          </span>
        </a>

        {/* Delete - requires track selection */}
        <a
          href="#"
          className={!selectedTrackId ? "dropdown-item-disabled" : ""}
          onClick={handleDelete}
          onMouseEnter={(e) =>
            !selectedTrackId &&
            handleMouseEnter("Please select a track first", e)
          }
          onMouseLeave={handleMouseLeave}
          style={{
            cursor: selectedTrackId ? "pointer" : "not-allowed",
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              gap: "8px",
            }}
          >
            <DeleteIcon />
            <span>Delete</span>
          </span>
        </a>
      </div>
    ),

    /**
     * Tools menu: Equalizer and Sampler
     * Opens respective tool modals when clicked
     */
    tools: (
      <div
        ref={toolsDropdownRef}
        className="dropdown-content dropdown-content-tools"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          zIndex: 99999,
        }}
        onMouseLeave={handleDropdownMouseLeave}
      >
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setIsEQOpen((prev) => !prev); // Toggle Equalizer modal
          }}
        >
          Equalizer
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setIsSamplerOpen((prev) => !prev); // Toggle Sampler modal
          }}
        >
          Sampler
        </a>
      </div>
    ),

    /**
     * Settings menu: Themes submenu, Fullscreen toggle, About link
     * Includes hover-based submenu for theme selection
     */
    settings: (
      <div
        ref={settingsDropdownRef}
        className="dropdown-content dropdown-content-settings"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          zIndex: 99999,
        }}
        onMouseLeave={handleDropdownMouseLeave}
      >
        {/* Themes with hover submenu */}
        <div
          className={`dropdown-item-with-submenu${
            activeSubmenu === "themes" ? " open" : ""
          }`}
          onMouseEnter={() => setActiveSubmenu("themes")}
          onMouseLeave={() => setActiveSubmenu(null)}
        >
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="dropdown-item-with-arrow"
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                gap: "8px",
              }}
            >
              <ThemesIcon />
              <span>Themes</span>
            </span>
          </a>
          {/* Theme selection submenu */}
          {activeSubmenu === "themes" && (
            <div className="dropdown-submenu">
              {themeOptions.map((option) => (
                <button
                  key={option.id}
                  className={`submenu-item${
                    theme === option.id ? " active" : ""
                  }`}
                  onClick={() => {
                    setTheme(option.id);
                    setActiveSubmenu(null);
                    setActiveDropdown(null);
                  }}
                >
                  {option.label}
                  {theme === option.id && (
                    <span className="submenu-check">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Fullscreen toggle - shows different icon/text based on current state */}
        <a
          href="#"
          onClick={() =>
            checkFullscreen() ? exitFullscreen() : enterFullScreen()
          }
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              gap: "8px",
            }}
          >
            {isFullscreen ? <BsArrowsAngleContract /> : <BsArrowsFullscreen />}
            <span>{isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}</span>
          </span>
        </a>

        {/* About link - opens GitHub README in new tab */}
        <a
          href="https://github.com/ejohn80/WebAmpers/blob/main/README.md"
          target="_blank"
          rel="noreferrer"
        >
          About
        </a>
      </div>
    ),

    /**
     * Guest/User menu: Shows Login/Register for guests, Logout for authenticated users
     */
    guest: (
      <div
        ref={guestDropdownRef}
        className="dropdown-content dropdown-content-guest"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          zIndex: 99999,
        }}
        onMouseLeave={handleDropdownMouseLeave}
      >
        {userData ? (
          // Authenticated user: Logout option
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              logout();
            }}
          >
            Logout
          </a>
        ) : (
          // Guest user: Login and Register options
          <>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                handleMenuItemClick("Login");
              }}
            >
              Login
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                handleMenuItemClick("Register");
              }}
            >
              Register
            </a>
          </>
        )}
      </div>
    ),
  };

  // ================================
  // Main Component Render
  // ================================

  return (
    <>
      {/* Main button container - stays in normal document flow */}
      <div className="FETS-container">
        {/* Left-side menus: File, Edit, Tools, Settings */}
        {side == "left" && (
          <>
            {/* File Dropdown Button */}
            <div className="dropdown">
              <button
                ref={fileButtonRef}
                className={getButtonClass("", "file")}
                onClick={() => handleButtonClick("file", fileButtonRef)}
              >
                File
              </button>
            </div>

            {/* Edit Dropdown Button */}
            <div className="dropdown">
              <button
                ref={editButtonRef}
                className={getButtonClass("", "edit")}
                onClick={() => handleButtonClick("edit", editButtonRef)}
              >
                Edit
              </button>
            </div>

            {/* Tools Dropdown Button */}
            <div className="dropdown">
              <button
                ref={toolsButtonRef}
                className={getButtonClass("tools", "tools")}
                onClick={() => handleButtonClick("tools", toolsButtonRef)}
              >
                Tools
              </button>
            </div>

            {/* Settings Dropdown Button */}
            <div className="dropdown">
              <button
                ref={settingsButtonRef}
                className={getButtonClass("settings", "settings")}
                onClick={() => handleButtonClick("settings", settingsButtonRef)}
              >
                Settings
              </button>
            </div>
          </>
        )}

        {/* Right-side guest/user button */}
        {side == "right" && (
          <div className="dropdown">
            <button
              ref={guestButtonRef}
              className={getButtonClass("guest", "guest")}
              onClick={() => handleButtonClick("guest", guestButtonRef)}
            >
              <span style={{display: "flex", alignItems: "center", gap: "8px"}}>
                <GuestIcon />
                <span>{userData ? userData.username : "Guest"}</span>
              </span>
            </button>
          </div>
        )}
      </div>

      {/* ================================
         Modal & Tool Portals
         ================================ */}

      {/* Equalizer Modal - renders when isEQOpen is true */}
      {isEQOpen && (
        <Equalizer
          isOpen={true}
          onClose={() => setIsEQOpen(false)}
          onEQChange={(eqSettings, values) => {
            console.log("EQ changed:", eqSettings, values);
          }}
          style={{
            position: "fixed",
            top: "100px",
            left: "100px",
            zIndex: 999999, // Higher than dropdowns
          }}
        />
      )}

      {/* Sampler Modal - renders when isSamplerOpen is true */}
      {isSamplerOpen && (
        <Sampler
          isOpen={isSamplerOpen}
          onClose={() => setIsSamplerOpen(false)}
          onSaveRecording={onSamplerRecording}
          style={{
            position: "fixed",
            top: "100px",
            left: "100px",
            zIndex: 999999, // Higher than dropdowns
          }}
        />
      )}

      {/* Save Modal - renders when isSaveModalOpen is true */}
      {isSaveModalOpen && (
        <SaveLoadModal
          mode="save"
          isOpen={isSaveModalOpen}
          onClose={() => setIsSaveModalOpen(false)}
        />
      )}

      {/* Load Modal - renders when isLoadModalOpen is true */}
      {isLoadModalOpen && (
        <SaveLoadModal
          mode="load"
          isOpen={isLoadModalOpen}
          onClose={() => setIsLoadModalOpen(false)}
          onLoadComplete={(stats) => {
            console.log("Session loaded:", stats);

            // Switch to the newly loaded session
            setActiveSession(stats.sessionId);
          }}
        />
      )}

      {/* ================================
         Dropdown Portals
         ================================
         All dropdowns are rendered via React portals to document.body
         This ensures proper z-index stacking and escape from parent containers */}
      {activeDropdown &&
        ReactDOM.createPortal(dropdownContent[activeDropdown], document.body)}

      {/* ================================
         Tooltip Portal
         ================================
         Tooltips are also rendered via portal for proper overlay behavior */}
      {tooltip.show &&
        ReactDOM.createPortal(
          <div
            style={{
              position: "fixed",
              left: `${tooltip.x}px`,
              top: `${tooltip.y}px`,
              transform: "translateX(-50%)",
              backgroundColor: "rgba(0, 0, 0, 0.9)",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: "4px",
              fontSize: "12px",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 100000, // Higher than dropdowns
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
            }}
          >
            {tooltip.text}
          </div>,
          document.body
        )}
    </>
  );
}

export default DropdownPortal;
