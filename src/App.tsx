import { Suspense, lazy, useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import { ReaderPage } from './pages/ReaderPage';

const NovelStudioPage = lazy(() => import('./studio/pages/NovelStudioPage'));

function LegacyHashRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#/chapter/') || hash.startsWith('#/editor')) {
      navigate(hash.slice(1), { replace: true });
    }
  }, [navigate]);

  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <LegacyHashRedirect />
      <Routes>
        <Route path="/" element={<ReaderPage />} />
        <Route path="/chapter/:chapterId" element={<ReaderPage />} />
        <Route
          path="/editor/*"
          element={
            <Suspense
              fallback={
                <div
                  style={{
                    minHeight: '100vh',
                    display: 'grid',
                    placeItems: 'center',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  Memuat Novel Studio…
                </div>
              }
            >
              <NovelStudioPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
