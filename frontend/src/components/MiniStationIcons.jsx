import React from "react";

/**
 * Miniature, simplified versions of the station icons designed specifically
 * for 24px sizes (e.g., in navbars) where fine details of the main icons
 * would become indistinguishable.
 */
export default function MiniStationIcon({ type, size = 24, color = "var(--primary)" }) {
  const commonProps = {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: color,
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };

  switch (type) {
    case "asrs":
      // A miniature 3x3 rack with a solid block for the shuttle
      return (
        <svg {...commonProps}>
          <rect x="3" y="3" width="6" height="6" rx="1" />
          <rect x="15" y="3" width="6" height="6" rx="1" />
          <rect x="3" y="15" width="6" height="6" rx="1" />
          <rect x="15" y="15" width="6" height="6" rx="1" fill={color} />
        </svg>
      );
      
    case "mirac":
      // Miniature lathe: headstock, chuck, workpiece
      return (
        <svg {...commonProps}>
          <path d="M3 6h4v12H3z" fill={color} stroke="none" />
          <path d="M7 10h4v4H7z" />
          <path d="M11 11h9v2h-9z" />
          <circle cx="20" cy="12" r="1" fill={color} stroke="none" />
        </svg>
      );

    case "triac":
      // Miniature mill: Column, spindle, table
      return (
        <svg {...commonProps}>
          <path d="M6 3h12v4H6z" />
          <path d="M10 7h4v6h-4z" fill={color} stroke="none" />
          <path d="M12 13l-2 3h4z" />
          <path d="M4 18h16v3H4z" />
        </svg>
      );

    case "assembly":
      // Miniature press
      return (
        <svg {...commonProps}>
          <path d="M6 4h12v3H6z" />
          <path d="M11 7h2v6h-2z" fill={color} stroke="none" />
          <path d="M9 13h6v2H9z" />
          <path d="M5 19h14v2H5z" />
        </svg>
      );

    case "testing":
      // Miniature CMM probe
      return (
        <svg {...commonProps}>
          <path d="M12 2v10" />
          <circle cx="12" cy="14" r="2" fill={color} stroke="none" />
          <path d="M6 20h12" />
        </svg>
      );

    case "inspection":
      // Miniature vision camera looking down
      return (
        <svg {...commonProps}>
          <path d="M8 4h8v6H8z" />
          <path d="M10 10l-2 4h8l-2-4" fill={color} stroke="none" />
          <rect x="6" y="18" width="12" height="4" rx="1" />
        </svg>
      );

    case "amr":
      // Miniature mobile robot
      return (
        <svg {...commonProps}>
          <rect x="4" y="8" width="16" height="8" rx="2" />
          <circle cx="8" cy="18" r="2" fill={color} stroke="none" />
          <circle cx="16" cy="18" r="2" fill={color} stroke="none" />
          <path d="M14 8V5h3" />
        </svg>
      );

    case "cobot":
      // Miniature robotic arm
      return (
        <svg {...commonProps}>
          <path d="M8 20h8" />
          <path d="M12 20v-6" />
          <circle cx="12" cy="14" r="2" fill={color} stroke="none" />
          <path d="M12 14l5-6" />
          <circle cx="17" cy="8" r="2" fill={color} stroke="none" />
          <path d="M17 8h3" />
        </svg>
      );

    default:
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}
