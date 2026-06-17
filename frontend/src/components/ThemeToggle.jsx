import { FaMoon, FaSun, FaDesktop } from "react-icons/fa";
import { useTheme } from "../theme/ThemeContext";

const labels = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export default function ThemeToggle({ compact = false }) {
  const { preference, cycleTheme } = useTheme();
  const Icon = preference === "light" ? FaSun : preference === "dark" ? FaMoon : FaDesktop;

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycleTheme}
      title={`Theme: ${labels[preference]}. Click to change.`}
      aria-label={`Theme: ${labels[preference]}. Click to change.`}
    >
      <Icon className="theme-toggle-icon" aria-hidden />
      {!compact && <span className="theme-toggle-label">{labels[preference]}</span>}
    </button>
  );
}
