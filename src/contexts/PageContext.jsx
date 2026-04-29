import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getFbPages } from '../utils/api';

const PageContext = createContext();

export function PageProvider({ children }) {
  const [pages, setPages] = useState([]);
  const [activePage, setActivePage] = useState(null); // null = "Tất cả"
  const [loading, setLoading] = useState(true);

  const loadPages = useCallback(async () => {
    try {
      const res = await getFbPages();
      setPages(res.data.data);
    } catch (err) {
      console.error('Failed to load pages:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadPages(); }, [loadPages]);

  // Persist active page
  useEffect(() => {
    const saved = localStorage.getItem('ia_active_page');
    if (saved && saved !== 'null') {
      setActivePage(parseInt(saved));
    }
  }, []);

  const selectPage = useCallback((pageId) => {
    setActivePage(pageId);
    localStorage.setItem('ia_active_page', pageId === null ? 'null' : pageId);
  }, []);

  const activePageData = pages.find(p => p.id === activePage) || null;

  return (
    <PageContext.Provider value={{ pages, activePage, activePageData, selectPage, loadPages, loading }}>
      {children}
    </PageContext.Provider>
  );
}

export function usePageContext() {
  return useContext(PageContext);
}
