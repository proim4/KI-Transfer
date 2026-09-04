import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import ProductSelect from './pages/ProductSelect';
import RawData from './pages/RawData';
import Settings from './pages/Settings';
import TrackingChannel from './pages/TrackingChannel';
import Upload from './pages/Upload';
import AdminGuard from './routes/AdminGuard';
import AuthGuard from './routes/AuthGuard';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AuthGuard />}>
        <Route element={<Layout />}>
          <Route path="/" element={<ProductSelect />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/raw-data" element={<RawData />} />
          <Route
            path="/tracking/weekly"
            element={<TrackingChannel channel="weekly" title="ติดตามโอน Weekly เทียบแผน" />}
          />
          <Route
            path="/tracking/daily"
            element={<TrackingChannel channel="daily" title="ติดตามโอน Daily เทียบแผน" />}
          />
          <Route
            path="/tracking/total"
            element={<TrackingChannel channel="total" title="ติดตามโอนรวม (Weekly + Daily) เทียบแผน" />}
          />
          <Route path="/pork/dashboard" element={<Dashboard productLine="pork" />} />
          <Route path="/pork/upload" element={<Upload productLine="pork" />} />
          <Route path="/pork/raw-data" element={<RawData productLine="pork" />} />
          <Route
            path="/pork/tracking/daily"
            element={<TrackingChannel channel="daily" title="ติดตามโอน (หมู) เทียบแผน" productLine="pork" />}
          />
          <Route element={<AdminGuard />}>
            <Route path="/settings" element={<Settings />} />
          </Route>
          {/* Any unmatched path (typo, a URL that doesn't exist like /pork/tracking/weekly) previously rendered a blank page with no feedback at all. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
