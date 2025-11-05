import React, {useState, useEffect, useRef, useContext} from "react";
import { logout } from '../Auth/AuthUtils'
import { AppContext } from "../../context/AppContext";
import ReactDOM from "react-dom";
import {useNavigate} from "react-router-dom";

import AudioExportButton from "../AudioExport/AudioExportButton";

import "./Header.css";
import {
  ExportIcon,
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

function DropdownPortal({ side }) {
  const navigate = useNavigate();
  const { userData, loading } = useContext(AppContext);

  const [activeDropdown, setActiveDropdown] = useState(null);
  const [position, setPosition] = useState({top: 0, left: 0});

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

  const handleMenuItemClick = (action) => {
    console.log(`Selected: ${action}`);

    // Handle navigation for guest dropdown
    if (action === "Login") {
      navigate("/login");
    } else if (action === "Register") {
      navigate("/register");
    }

    setActiveDropdown(null);
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

  // Handle mouse leave from dropdown
  const handleDropdownMouseLeave = (event) => {
    const relatedTarget = event.relatedTarget;
    const dropdown = event.currentTarget;

    if (!dropdown.contains(relatedTarget)) {
      setActiveDropdown(null);
    }
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

  // Helper function to get button class with active state
  const getButtonClass = (buttonType, dropdownName) => {
    const baseClass = `dropdown-btn${buttonType ? `-${buttonType}` : ""}`;
    return activeDropdown === dropdownName ? `${baseClass} active` : baseClass;
  };

  // Dropdown content for each menu with individual styling
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
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleMenuItemClick("New");
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
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleMenuItemClick("Previous Versions");
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
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleMenuItemClick("Save");
          }}
        >
          <span>Save</span>
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
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
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleMenuItemClick("Undo");
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
            <UndoIcon />
            <span>Undo</span>
          </span>
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleMenuItemClick("Redo");
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
            <RedoIcon />
            <span>Redo</span>
          </span>
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleMenuItemClick("Cut");
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
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleMenuItemClick("Copy");
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
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleMenuItemClick("Paste");
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
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleMenuItemClick("Delete");
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
            handleMenuItemClick("Tool 1");
          }}
        >
          Tool 1
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleMenuItemClick("Tool 2");
          }}
        >
          Tool 2
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleMenuItemClick("Tool 3");
          }}
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
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleMenuItemClick("Sound Quality");
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
            <SoundQualityIcon />
            <span>Sound Quality</span>
          </span>
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleMenuItemClick("Themes");
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
            <ThemesIcon />
            <span>Themes</span>
          </span>
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleMenuItemClick("Color Accessibility");
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
            <ColorAccessibilityIcon />
            <span>Color Accessibility</span>
          </span>
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleMenuItemClick("About");
          }}
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
      {userData ? 
        <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              logout();
            }}
          >
            Logout
          </a>
      
      : 
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
      }
      </div>
    ),
  };

  return (
    <>
      {/* Buttons stay in normal flow */}
      <div className="FETS-container">
        {/* Menu Buttons */}
        {side == 'left' && (
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
        {side == 'right' && (
          <div className="dropdown">
            <button
              ref={guestButtonRef}
              className={getButtonClass("guest", "guest")}
              onClick={() => handleButtonClick("guest", guestButtonRef)}
            >
              <span style={{display: "flex", alignItems: "center", gap: "8px"}}>
                <GuestIcon />
                <span>{userData ? userData.username : 'Guest'}</span>
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Dropdowns rendered via portal */}
      {activeDropdown &&
        ReactDOM.createPortal(dropdownContent[activeDropdown], document.body)}
    </>
  );
}

export default DropdownPortal;
