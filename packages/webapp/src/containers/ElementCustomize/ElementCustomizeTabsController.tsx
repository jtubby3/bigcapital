import React, { createContext, useContext, useState } from 'react';

export enum ElementCustomizeTabsEnum {
  General = 'general',
  Items = 'items',
  Totals = 'totals',
}

const DEFAULT_TAB_ID = ElementCustomizeTabsEnum.General;

interface ElementCustomizeTabsControllerValue {
  currentTabId: string;
  setCurrentTabId: React.Dispatch<React.SetStateAction<string>>;
}

const ElementCustomizeTabsController = createContext(
  {} as ElementCustomizeTabsControllerValue,
);

export const useElementCustomizeTabsController = () => {
  return useContext(ElementCustomizeTabsController);
};

interface ElementCustomizeTabsControllerProps {
  children: React.ReactNode;
}

export const ElementCustomizeTabsControllerProvider = ({
  children,
}: ElementCustomizeTabsControllerProps) => {
  const [currentTabId, setCurrentTabId] = useState<string>(DEFAULT_TAB_ID);

  const value = {
    currentTabId,
    setCurrentTabId,
  };

  return (
    <ElementCustomizeTabsController.Provider value={value}>
      {children}
    </ElementCustomizeTabsController.Provider>
  );
};
