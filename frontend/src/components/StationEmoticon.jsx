import React from "react";
import AsrsIcon from "./icons/AsrsIcon";
import MiracIcon from "./icons/MiracIcon";
import TriacIcon from "./icons/TriacIcon";
import AssemblyIcon from "./icons/AssemblyIcon";
import AmrIcon from "./icons/AmrIcon";
import CobotIcon from "./icons/CobotIcon";
import InspectionIcon from "./icons/InspectionIcon";
import TestingIcon from "./icons/TestingIcon";
import "./StationEmoticon.css";

export default function StationEmoticon({ machineType, state = "offline", size = 60 }) {
  // state can be: 'running', 'idle', 'error', 'offline'
  
  let emoji = "🤖"; // offline
  if (state === "running") emoji = "😃";
  else if (state === "idle") emoji = "😴";
  else if (state === "error") emoji = "😵";

  const style = {
    width: `${size}px`,
    height: `${size}px`,
    fontSize: `${size * 0.5}px`
  };

  if (machineType === "asrs") {
    return <AsrsIcon state={state} size={size * 1.2} />;
  }

  if (machineType === "mirac") {
    return <MiracIcon state={state} size={size} />;
  }

  if (machineType === "triac") {
    return <TriacIcon state={state} size={size} />;
  }

  if (machineType === "assembly") {
    return <AssemblyIcon state={state} size={size} />;
  }

  if (machineType === "amr") {
    return <AmrIcon state={state} size={size} />;
  }

  if (machineType === "cobot") {
    return <CobotIcon state={state} size={size} />;
  }

  if (machineType === "inspection") {
    return <InspectionIcon state={state} size={size} />;
  }

  if (machineType === "testing") {
    return <TestingIcon state={state} size={size} />;
  }

  return (
    <div className={`station-emoticon state-${state}`} style={style} title={`Status: ${state.toUpperCase()}`}>
      {emoji}
      
      {state === "idle" && (
        <div className="sleeping-zzz">
          <span>z</span>
          <span>z</span>
          <span>Z</span>
        </div>
      )}
    </div>
  );
}
