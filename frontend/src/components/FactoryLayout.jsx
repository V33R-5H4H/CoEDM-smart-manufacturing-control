import React from "react";
import { Link } from "react-router-dom";
import StationEmoticon from "./StationEmoticon";
import "./FactoryLayout.css";

export default function FactoryLayout({ stations }) {
  // Map station keys to absolute X, Y percentages on the floor plan
  const coordinates = {
    asrs: { x: 15, y: 15 },
    amr: { x: 35, y: 50 },
    assembly: { x: 55, y: 15 },
    mirac: { x: 85, y: 25 },
    triac: { x: 85, y: 75 },
    testing: { x: 55, y: 85 },
    inspection: { x: 15, y: 85 },
    cobot: { x: 55, y: 50 },
  };

  return (
    <div className="factory-floor">
      {/* Interactive SVG Paths representing material flow / AGV lines */}
      <svg className="factory-paths">
        {/* Main aisle horizontal */}
        <line x1="15%" y1="50%" x2="85%" y2="50%" className="path-line active" />
        
        {/* Vertical connections */}
        <line x1="15%" y1="15%" x2="15%" y2="85%" className="path-line active" />
        <line x1="55%" y1="15%" x2="55%" y2="85%" className="path-line active" />
        <line x1="85%" y1="25%" x2="85%" y2="75%" className="path-line active" />
      </svg>

      {/* Place each station node */}
      {stations.map((s) => {
        const coords = coordinates[s.key] || { x: 50, y: 50 }; // fallback to center
        return (
          <Link
            key={s.key}
            to={s.to}
            className="factory-node"
            style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
          >
            <StationEmoticon machineType={s.key} state={s.emoticonState} size={50} />
            <h4>{s.name}</h4>
            
            <div className="factory-node-metrics">
              {s.metrics.map((m, idx) => (
                <div key={idx} className="factory-node-metric">
                  <span className="label">{m.label}</span>
                  <span className="value">
                    {m.value} <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>{m.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
