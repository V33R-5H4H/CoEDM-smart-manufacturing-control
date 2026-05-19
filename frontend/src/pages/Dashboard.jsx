import { Link } from "react-router-dom";
import { FaCogs, FaMicrochip, FaTools, FaIndustry } from "react-icons/fa";

export default function Dashboard() {
  const modules = [
    { name: "AS/RS", to: "/asrs", icon: <FaCogs />, color: "primary" },
    { name: "Smart TRIAC PC", to: "/triac", icon: <FaMicrochip />, color: "secondary" },
    { name: "Smart MIRAC PC", to: "/mirac", icon: <FaTools />, color: "accent" },
    { name: "Assembly Station Control", to: "/assembly", icon: <FaIndustry />, color: "success" }
  ];

  return (
    <div className="animate-fade-in" style={{ padding: '1.5rem', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: "2.5rem", paddingBottom: "1.5rem", borderBottom: "1px solid var(--border)" }}>
        <h1 style={{
          fontSize: "2rem",
          fontWeight: "700",
          marginBottom: "0.5rem",
          color: "var(--text-primary)"
        }}>
          BVM Control Software
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "1rem" }}>
          Select a module to begin
        </p>
      </div>

      <div className="module-grid">
        {modules.map((m, i) => (
          <Link
            key={i}
            to={m.to}
            className="module-card"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="module-card-icon">
              {m.icon}
            </div>
            <div className="module-card-title">
              {m.name}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
