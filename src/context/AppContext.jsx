import {createContext, useState} from "react";

import {useUserData} from "../hooks/useUserData";

export const AppContext = createContext();

const AppContextProvider = ({children}) => {
  // User Data
  const {userData, loading} = useUserData();

  const [activeProject, setActiveProject] = useState();

  return (
    <AppContext.Provider
      value={{userData, loading, activeProject, setActiveProject}}
    >
      {children}
    </AppContext.Provider>
  );
};

export default AppContextProvider;
