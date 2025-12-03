import React, {useState, useEffect, useRef, useContext} from "react";
import {logout} from "../Auth/AuthUtils";
import {AppContext} from "../../context/AppContext";
import ReactDOM from "react-dom";
import {useNavigate} from "react-router-dom";

import AudioExportButton from "../AudioExport/AudioExportButton";
import AudioImportButton from "../AudioImport/AudioImportButton";

import "./Header.css";
import {
  ExportIcon,
  ImportIcon,
  NewIcon,
  PreviousVersionsIcon,
  UndoIcon,
  RedoIcon,
  CutIcon,
  CopyIcon,
  PasteIcon,
  DeleteIcon,
  SoundQualityIcon,
  ThemesIcon,
  ColorAccessibilityIcon,
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
  selectedTrackId,
  hasClipboard,
}) {
  const navigate = useNavigate();
  const {userData} = useContext(AppContext);

  const [activeDropdown, setActiveDropdown] = useState(null);
  const [position, setPosition] = useState({top: 0, left: 0});

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Tooltip state
  const [tooltip, setTooltip] = useState({show: false, text: "", x: 0, y: 0});

  const fileButtonRef = useRef(null);
  const editButtonRef = useRef(null);
  const toolsButtonRef = useRef(null);
  const settingsButtonRef = useRef(null);
  const guestButtonRef = useRef(null);

  const fileDropdownRef = useRef(null);
  const editDropdownRef = useRef(null);
  const toolsDropdownRef = useRef(null);
  const settingsDropdownRef = useRef(null);
  const guestDropdownRef = useRef(null);

  // Check if there are any tracks available for export
  const hasTracksForExport = tracks && tracks.length > 0;

  const handleMenuItemClick = (action) => {
    console.log(`Selected: ${action}`);

    if (action === "Login") {
      navigate("/login");
    } else if (action === "Register") {
      navigate("/register");
    }

    // Don't close dropdown for Import/Export (handled by their wrappers)
    if (action !== "Import" && action !== "Export") {
      setActiveDropdown(null);
    }
  };

  const handleButtonClick = (dropdownName, buttonRef) => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      });
    }

    setActiveDropdown(activeDropdown === dropdownName ? null : dropdownName);
  };

  const handleDropdownMouseLeave = (event) => {
    const relatedTarget = event.relatedTarget;
    const dropdown = event.currentTarget;

    if (!dropdown.contains(relatedTarget)) {
      setActiveDropdown(null);
    }
  };

  // Handle Cut/Copy/Paste actions
  const handleCut = (e) => {
    e.preventDefault();
    if (!selectedTrackId) return;
    onCutTrack?.();
    setActiveDropdown(null);
  };

  const handleCopy = (e) => {
    e.preventDefault();
    if (!selectedTrackId) return;
    onCopyTrack?.();
    setActiveDropdown(null);
  };

  const handlePaste = (e) => {
    e.preventDefault();
    if (!hasClipboard) return;
    onPasteTrack?.();
    setActiveDropdown(null);
  };

  // Tooltip handlers
  const handleMouseEnter = (text, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      show: true,
      text,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 5,
    });
  };

  const handleMouseLeave = () => {
    setTooltip({show: false, text: "", x: 0, y: 0});
  };

  useEffect(() => {
    function handleClickOutside(event) {
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
  }, [activeDropdown]);

  const getButtonClass = (buttonType, dropdownName) => {
    const baseClass = `dropdown-btn${buttonType ? `-${buttonType}` : ""}`;
    return activeDropdown === dropdownName ? `${baseClass} active` : baseClass;
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(checkFullscreen());
    };

    // Fullscreen
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      // Fullscreen
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
  }, []);

  const enterFullScreen = () => {
    let element = document.documentElement;
    setIsFullscreen(true);

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

  const checkFullscreen = () => {
    return Boolean(
      document.fullscreenElement || // Standard
        document.webkitFullscreenElement || // Chrome and Opera
        document.mozFullScreenElement || // Firefox
        document.msFullscreenElement // IE/Edge
    );
  };

  const dropdownContent = {
    file: (
      <div
        ref={fileDropdownRef}
        className="dropdown-content dropdown-content-file"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          zIndex: 99999,
        }}
        onMouseLeave={handleDropdownMouseLeave}
      >
        {/* DISABLED - New */}
        <a
          href="#"
          className="dropdown-item-disabled"
          onClick={(e) => {
            e.preventDefault();
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
            <NewIcon />
            <span>New...</span>
          </span>
        </a>

        {/* DISABLED - Previous Versions */}
        <a
          href="#"
          className="dropdown-item-disabled"
          onClick={(e) => {
            e.preventDefault();
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
            <PreviousVersionsIcon />
            <span>Previous Versions</span>
          </span>
        </a>

        {/* DISABLED - Save */}
        <a
          href="#"
          className="dropdown-item-disabled"
          onClick={(e) => {
            e.preventDefault();
          }}
        >
          <span>Save</span>
        </a>

        {/* ENABLED - Import Audio */}
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

        {/* ENABLED/DISABLED - Export (conditional based on tracks) */}
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

    edit: (
      <div
        ref={editDropdownRef}
        className="dropdown-content dropdown-content-edit"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          zIndex: 99999,
        }}
        onMouseLeave={handleDropdownMouseLeave}
      >
        {/* DISABLED - Undo */}
        <a
          href="#"
          className="dropdown-item-disabled"
          onClick={(e) => e.preventDefault()}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              gap: "8px",
            }}
          >
            <UndoIcon />
            <span>Undo</span>
          </span>
        </a>

        {/* DISABLED - Redo */}
        <a
          href="#"
          className="dropdown-item-disabled"
          onClick={(e) => e.preventDefault()}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              gap: "8px",
            }}
          >
            <RedoIcon />
            <span>Redo</span>
          </span>
        </a>

        {/* ENABLED/DISABLED - Cut (depends on track selection) */}
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

        {/* ENABLED/DISABLED - Copy (depends on track selection) */}
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

        {/* ENABLED/DISABLED - Paste (depends on clipboard) */}
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

        {/* DISABLED - Delete */}
        <a
          href="#"
          className="dropdown-item-disabled"
          onClick={(e) => e.preventDefault()}
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
        {/* ALL DISABLED */}
        <a
          href="#"
          className="dropdown-item-disabled"
          onClick={(e) => e.preventDefault()}
        >
          Tool 1
        </a>
        <a
          href="#"
          className="dropdown-item-disabled"
          onClick={(e) => e.preventDefault()}
        >
          Tool 2
        </a>
        <a
          href="#"
          className="dropdown-item-disabled"
          onClick={(e) => e.preventDefault()}
        >
          Tool 3
        </a>
      </div>
    ),

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
        {/* ALL DISABLED */}
        <a
          href="#"
          className="dropdown-item-disabled"
          onClick={(e) => e.preventDefault()}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              gap: "8px",
            }}
          >
            <SoundQualityIcon />
            <span>Sound Quality</span>
          </span>
        </a>
        <a
          href="#"
          className="dropdown-item-disabled"
          onClick={(e) => e.preventDefault()}
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
        <a
          href="#"
          className="dropdown-item-disabled"
          onClick={(e) => e.preventDefault()}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              gap: "8px",
            }}
          >
            <ColorAccessibilityIcon />
            <span>Color Accessibility</span>
          </span>
        </a>
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
        <a
          href="#"
          className="dropdown-item-disabled"
          onClick={(e) => e.preventDefault()}
        >
          About
        </a>
      </div>
    ),

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

  return (
    <>
      {/* Buttons stay in normal flow */}
      <div className="FETS-container">
        {/* Menu Buttons */}
        {side == "left" && (
          <>
            {/* File Dropdown */}
            <div className="dropdown">
              <button
                ref={fileButtonRef}
                className={getButtonClass("", "file")}
                onClick={() => handleButtonClick("file", fileButtonRef)}
              >
                File
              </button>
            </div>

            {/* Edit Dropdown */}
            <div className="dropdown">
              <button
                ref={editButtonRef}
                className={getButtonClass("", "edit")}
                onClick={() => handleButtonClick("edit", editButtonRef)}
              >
                Edit
              </button>
            </div>

            {/* Tools Dropdown */}
            <div className="dropdown">
              <button
                ref={toolsButtonRef}
                className={getButtonClass("tools", "tools")}
                onClick={() => handleButtonClick("tools", toolsButtonRef)}
              >
                Tools
              </button>
            </div>

            {/* Settings Dropdown */}
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

        {/* Guest Button */}
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

      {/* Dropdowns rendered via portal */}
      {activeDropdown &&
        ReactDOM.createPortal(dropdownContent[activeDropdown], document.body)}

      {/* Tooltip rendered via portal */}
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
              zIndex: 100000,
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
