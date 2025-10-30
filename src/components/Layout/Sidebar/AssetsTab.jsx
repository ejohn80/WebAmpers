import { useState } from "react";
import { IoSearch } from "react-icons/io5";
import { FaPlay } from "react-icons/fa";
import { IoPause } from "react-icons/io5"; // Will use for pausing
import AudioImportButton from "../../AudioImport/AudioImportButton";
import styles from "../Layout.module.css";

const dummySongs = [
  { id: 1, name: "Song AAAAAAA", duration: "04:48", bitrate: "128 kbps" },
  { id: 2, name: "Song B", duration: "01:32", bitrate: "192 kbps" },
];

const AssetsTab = ({ onImportSuccess, onImportError }) => {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredSongs = dummySongs.filter(song =>
    song.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        <div className={styles.searchBar}>
          <IoSearch size={18} color="#888" />
          <input
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.tableHeader}>
          <div>Name</div>
          <div>Duration</div>
          <div>Bitrate</div>
        </div>

        <div className={styles.songList}>
          {filteredSongs.length === 0 ? (
            <div className={styles.noResults}>No results</div>
          ) : (
            filteredSongs.map(song => (
              <div key={song.id} className={styles.songRow}>
                <div className={styles.songName}>
                  <FaPlay size={10} color="#fff" />
                  <span>{song.name}</span>
                </div>
                <div className={styles.songDuration}>{song.duration}</div>
                <div className={styles.songBitrate}>{song.bitrate}</div>
              </div>
            ))
          )}
        </div>

        <div className={styles.importButtonWrapper}>
          <AudioImportButton
            onImportSuccess={onImportSuccess}
            onImportError={onImportError}
          />
        </div>
      </div>
    </div>
  );
};

export default AssetsTab;
