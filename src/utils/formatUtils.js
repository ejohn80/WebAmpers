// input: ISO date string or any value accepted by new Date()
// output: "MM/DD/YYYY HH:MM:SS" (localized to the user's locale)
export const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString() + " " + date.toLocaleTimeString();
};

// input: number of bytes (integer)
// output: human-readable size string:
//   < 1024 bytes → "XYZ B"
//   < 1 MB       → "X.Y KB"
//   >= 1 MB      → "X.Y MB"
export const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};
