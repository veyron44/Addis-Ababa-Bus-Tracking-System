import { Route, Routes, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Search from './pages/Search';
import Stop from './pages/Stop';
import './tailwind.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/600.css';
import '@fontsource/rubik/700.css';
   import '@fontsource/inter/400.css';
   import '@fontsource/inter/600.css';
   import '@fontsource/inter/700.css';
   import '@fontsource/noto-sans-ethiopic/400.css';
   import '@fontsource/noto-sans-ethiopic/700.css';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={null} />
        <Route path="/stops" element={<Search />} />
        <Route path="/stops/:id" element={<Stop />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
