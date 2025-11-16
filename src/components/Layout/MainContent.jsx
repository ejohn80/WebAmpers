import React, {useContext} from "react";
import DraggableDiv from "../Generic/DraggableDiv";
import TrackLane from "../../components/TrackLane/TrackLane";
import {AppContext} from "../../context/AppContext";
import EffectsMenu from "./Effects/EffectsMenu";
import styles from "./MainContent.module.css";

/**
 * MainContent component for the application layout.
 * Displays the audio waveform or a placeholder message.
 * @param {object} props
 * @param {import('../../models/AudioTrack').AudioTrack} props.track - The currently active audio track.
 */
function MainContent({track, onMute, onSolo}) {
  const {isEffectsMenuOpen} = useContext(AppContext);

  return (
    <DraggableDiv
      className={`maincontent ${isEffectsMenuOpen ? styles.blurred : ""}`}
    >
      {/* Main Content */}
      {track ? (
        <TrackLane
          track={track}
          showTitle={false}
          onMute={onMute}
          onSolo={onSolo}
        />
      ) : (
        <div style={{textAlign: "center", alignSelf: "center"}}>
          <h2>Main Content</h2>
          <p>Import an audio file to see its waveform here.</p>
        </div>
      )}

      {/* Effects Menu */}
      {isEffectsMenuOpen && (
        <div className={styles.effectsMenuContainer}>
          <EffectsMenu />
        </div>
      )}
    </DraggableDiv>
  );
}

export default MainContent;
