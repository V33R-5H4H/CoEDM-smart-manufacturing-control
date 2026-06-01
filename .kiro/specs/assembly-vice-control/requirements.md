# Requirements Document: Independent Vice Control

## Introduction

This feature adds independent vice control to the assembly station (hydraulic press) in the CoEDM Smart Manufacturing Control system. Currently, the assembly station supports bearing and shaft operations through OPC-UA communication. The vice state is monitored via OPC-UA tags but cannot be controlled independently. This feature enables operators to open and close the vice manually, independent of bearing/shaft operations, while maintaining visibility of the vice state.

## Glossary

- **Assembly Station**: The hydraulic press system that performs bearing and shaft assembly operations
- **Vice**: The mechanical clamping mechanism on the assembly station that holds workpieces during operation
- **OPC-UA**: Open Platform Communications Unified Architecture - industrial communication protocol used to interface with the hydraulic station PLC
- **Vice Open**: State where vice jaws are separated (value: true)
- **Vice Close**: State where vice jaws are clamped (value: true)
- **Independent Control**: Vice operations that can be performed without affecting bearing/shaft operations

## Requirements

### Requirement 1: Vice Open Command

**User Story:** As an operator, I want to open the vice independently, so that I can load or unload workpieces without performing bearing or shaft operations.

#### Acceptance Criteria

1. WHEN the operator clicks the "Open Vice" button, THE Assembly Control Service SHALL send a vice open command to the hydraulic station
2. WHEN the vice open command is sent, THE OPC-UA Driver SHALL set the vice open tag to true and vice close tag to false
3. IF the OPC-UA connection is not established, THEN THE System SHALL return an error message indicating connection is required
4. WHEN the vice open command completes successfully, THE System SHALL broadcast the updated vice state via WebSocket
5. WHEN the vice open command fails, THEN THE System SHALL return a descriptive error message

### Requirement 2: Vice Close Command

**User Story:** As an operator, I want to close the vice independently, so that I can secure workpieces for assembly operations.

#### Acceptance Criteria

1. WHEN the operator clicks the "Close Vice" button, THE Assembly Control Service SHALL send a vice close command to the hydraulic station
2. WHEN the vice close command is sent, THE OPC-UA Driver SHALL set the vice close tag to true and vice open tag to false
3. IF the OPC-UA connection is not established, THEN THE System SHALL return an error message indicating connection is required
4. WHEN the vice close command completes successfully, THE System SHALL broadcast the updated vice state via WebSocket
5. WHEN the vice close command fails, THEN THE System SHALL return a descriptive error message

### Requirement 3: Independent Operation

**User Story:** As an operator, I want vice operations to be independent of bearing/shaft operations, so that I can control the vice without affecting active assembly operations.

#### Acceptance Criteria

1. WHEN a vice command (open/close) is executed, THE System SHALL NOT modify the bearing or shaft operation states
2. WHEN bearing or shaft operations are active, THE System SHALL allow vice open/close commands to execute concurrently
3. WHEN vice operations are active, THE System SHALL allow bearing or shaft operations to execute concurrently
4. IF a vice command is received while another vice command is in progress, THEN THE System SHALL queue or reject the duplicate command with an appropriate message

### Requirement 4: Vice State Display

**User Story:** As an operator, I want to see the current vice state in the UI, so that I can verify the vice position before performing operations.

#### Acceptance Criteria

1. WHEN WebSocket data is received, THE UI SHALL display the vice open state with a visual indicator
2. WHEN WebSocket data is received, THE UI SHALL display the vice close state with a visual indicator
3. WHEN the vice is open, THE UI SHALL show a clear "Vice: Open" status
4. WHEN the vice is closed, THE UI SHALL show a clear "Vice: Closed" status
5. IF vice state data is unavailable, THEN THE UI SHALL display "Vice: Unknown" with appropriate styling

### Requirement 5: Error Handling

**User Story:** As an operator, I want clear error messages when vice operations fail, so that I can diagnose and resolve issues quickly.

#### Acceptance Criteria

1. IF the OPC-UA connection is lost during a vice command, THEN THE System SHALL return an error indicating connection failure
2. IF an invalid vice command is sent, THEN THE System SHALL return a validation error with available commands
3. IF the hydraulic station returns an error, THEN THE System SHALL return the station's error message to the UI
4. WHEN a vice command times out, THEN THE System SHALL return a timeout error with retry guidance
5. WHEN any vice operation fails, THE UI SHALL display a non-intrusive error notification

### Requirement 6: UI Integration

**User Story:** As an operator, I want vice control buttons on the Assembly page, so that I can easily access vice operations alongside other assembly controls.

#### Acceptance Criteria

1. WHEN the Assembly page loads, THE UI SHALL display vice control buttons in a dedicated section
2. WHEN the vice is open, THE "Open Vice" button SHALL be disabled or visually distinct
3. WHEN the vice is closed, THE "Close Vice" button SHALL be disabled or visually distinct
4. WHEN a vice command is executing, THE corresponding button SHALL show a loading state
5. WHEN the vice state changes, THE UI SHALL update the visual indicator within 1 second
