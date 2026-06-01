import React from 'react';

/**
 * Small inline dot indicator for sensor connectivity
 */
const SensorDot = ({ connected }) => (
  <span
    style={{
      display: "inline-block",
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: connected ? "#3a9d6e" : "#c4424b",
      marginRight: 6,
      verticalAlign: "middle",
    }}
  />
);

export default SensorDot;
