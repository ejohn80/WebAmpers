// import React from "react";
// import AudioImportButton from "../AudioImport/AudioImportButton";
// import {logout} from "../Auth/AuthUtils";
// import {useUserData} from "../../hooks/useUserData";
// import {useNavigate} from "react-router-dom";
// import DropdownPortal from "./DropdownPortal";
// import "./Header.css";

// function Header({
//   onImportSuccess,
//   onImportError,
//   audioBuffer,
//   onExportComplete,
// }) {
//   const navigate = useNavigate();
//   const {userData, loading} = useUserData();

//   return (
//     <div className="header">
//       <div className="container">
//         {/* container for logo + dropdown */}
//         <div className="leftContainer">
//           <span className="webampText">Webamp</span>
//           <DropdownPortal showMenuButtons={true} showGuestButton={false} />
//         </div>

//         <div style={{display: "flex", alignItems: "center", gap: "15px"}}>
//           {/* Audio Import Button */}
//           <AudioImportButton
//             onImportSuccess={onImportSuccess}
//             onImportError={onImportError}
//           />

//           {userData ? (
//             <button onClick={logout}>Log out</button>
//           ) : (
//             <DropdownPortal showMenuButtons={false} showGuestButton={true} />
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }

// export default Header;

import React from "react";
import AudioImportButton from "../AudioImport/AudioImportButton";
// import AudioExportButton from "../AudioExport/AudioExportButton"; // REMOVE THIS IMPORT
import {logout} from "../Auth/AuthUtils";
import {useUserData} from "../../hooks/useUserData";
import {useNavigate} from "react-router-dom";
import DropdownPortal from "./DropdownPortal";
import "./Header.css";

function Header({
  onImportSuccess,
  onImportError,
  audioBuffer,
  onExportComplete,
}) {
  const navigate = useNavigate();
  const {userData, loading} = useUserData();

  return (
    <div className="header">
      <div className="container">
        {/* container for logo + dropdown */}
        <div className="leftContainer">
          <span className="webampText">Webamp</span>
          {/* PASS audioBuffer and onExportComplete to DropdownPortal */}
          <DropdownPortal
            showMenuButtons={true}
            showGuestButton={false}
            audioBuffer={audioBuffer} // NEW
            onExportComplete={onExportComplete} // NEW
          />
        </div>

        <div style={{display: "flex", alignItems: "center", gap: "15px"}}>
          {/* Audio Import Button */}
          <AudioImportButton
            onImportSuccess={onImportSuccess}
            onImportError={onImportError}
          />

          {/* Audio Export Button REMOVED */}

          {userData ? (
            <button onClick={logout}>Log out</button>
          ) : (
            <DropdownPortal showMenuButtons={false} showGuestButton={true} />
          )}
        </div>
      </div>
    </div>
  );
}

export default Header;