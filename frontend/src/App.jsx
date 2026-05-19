import { useState } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { FaTachometerAlt, FaCogs, FaMicrochip, FaIndustry, FaTools } from "react-icons/fa";
import Dashboard from "./pages/Dashboard";
import Triac from "./pages/Triac";
import Mirac from "./pages/Mirac";
import Assembly from "./pages/Assembly";
import ASRSDashboard from "./pages/asrs/Dashboard";

export default function App() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className={`sidebar ${isCollapsed ? 'collapsed' : 'expanded'}`}>
        <div className="sidebar-header">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="sidebar-toggle"
            style={{ fontSize: '1.5rem' }}
          >
            {isCollapsed ? "☰" : "✕"}
          </button>
        </div>

        <nav className="sidebar-nav">
          <NavItem to="/" icon={<FaTachometerAlt />} label="Dashboard" isCollapsed={isCollapsed} />
          <NavItem to="/asrs" icon={<FaCogs />} label="AS/RS" isCollapsed={isCollapsed} />
          <NavItem to="/triac" icon={<FaMicrochip />} label="Smart TRIAC PC" isCollapsed={isCollapsed} />
          <NavItem to="/mirac" icon={<FaTools />} label="Smart MIRAC PC" isCollapsed={isCollapsed} />
          <NavItem to="/assembly" icon={<FaIndustry />} label="Assembly Station" isCollapsed={isCollapsed} />
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/asrs" element={<ASRSDashboard />} />
          <Route path="/triac" element={<Triac />} />
          <Route path="/mirac" element={<Mirac />} />
          <Route path="/assembly" element={<Assembly />} />
        </Routes>
      </main>
    </div>
  );
}

function NavItem({ to, icon, label, isCollapsed }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
    >
      <span className="nav-item-icon">{icon}</span>
      <span className="nav-item-label">{label}</span>
    </NavLink>
  );
}