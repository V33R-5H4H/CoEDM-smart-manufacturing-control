# Implementation Plan: Independent Vice Control

## Overview

Add independent vice open/close control to the assembly station. The backend changes extend `HYDRAULIC_TAGS` and `run_hydraulic()` in `hydraulic_station.py` to accept `VICE_OPEN` and `VICE_CLOSE` commands without modifying bearing/shaft state. The frontend changes add two new buttons to `Assembly.jsx` (with handlers wired to `AssemblyControlService.runCommand()`) and corresponding styles in `Assembly.css`. WebSocket broadcasting and vice-state HUD display are already implemented and require no changes.

The implementation follows incremental steps: backend tag and command wiring first, then the API layer is verified as already dynamic, then frontend handlers and buttons, then styling, then tests covering the correctness properties from the design.

## Tasks

- [x] 1. Extend backend hydraulic command set
  - [x] 1.1 Add `VICE_OPEN` and `VICE_CLOSE` entries to `HYDRAULIC_TAGS`
    - Modify `backend/stations/assembly/hydraulic_station.py`
    - Map `VICE_OPEN` to `|var|AX-308EA0MA1P.Application.GVL.open`
    - Map `VICE_CLOSE` to `|var|AX-308EA0MA1P.Application.GVL.Close`
    - Keep existing `BEARING_ON` and `SHAFT_ON` entries untouched
    - _Requirements: 1.1, 2.1_

  - [x] 1.2 Extend `run_hydraulic()` to handle vice commands
    - Modify `backend/stations/assembly/hydraulic_station.py`
    - Add `VICE_OPEN` branch: set `vice_open` tag to `True` and `vice_close` tag to `False`
    - Add `VICE_CLOSE` branch: set `vice_close` tag to `True` and `vice_open` tag to `False`
    - Do NOT call `set_node_state` on `BEARING_ON` or `SHAFT_ON` tags inside the vice branches
    - Return the existing success-response dict shape with `command`, `tag`, and `message`
    - Reuse the existing `_validate_command` and `_ensure_connection` helpers (no signature changes)
    - _Requirements: 1.2, 2.2, 3.1_

  - [ ]* 1.3 Write unit tests for vice commands in `hydraulic_station.py`
    - Create `backend/tests/test_hydraulic_station.py`
    - Mock `opcua_connection` to capture `set_node_state` calls
    - Test `run_hydraulic("VICE_OPEN")` calls `set_node_state` with `(vice_open_tag, True)` and `(vice_close_tag, False)`
    - Test `run_hydraulic("VICE_CLOSE")` calls `set_node_state` with `(vice_close_tag, True)` and `(vice_open_tag, False)`
    - Test invalid command (e.g., `"VICE_FOO"`) raises `ValueError` with available-commands message
    - Test response dict shape (`success`, `command`, `tag`, `message`) for both commands
    - _Requirements: 1.2, 2.2, 5.2_

  - [ ]* 1.4 Write property tests for vice command correctness
    - Create `backend/tests/test_hydraulic_properties.py` using Hypothesis
    - **Property 1: Vice Open Command Sets Correct Tags** — for any input variant of `"VICE_OPEN"` (case/whitespace), verify `vice_open` set to `True`, `vice_close` set to `False`, and bearing/shaft tags are NEVER passed to `set_node_state`
    - **Property 2: Vice Close Command Sets Correct Tags** — symmetric assertion for `"VICE_CLOSE"`
    - **Property 5: Independent Operation** — generate random sequences of `VICE_OPEN`, `VICE_CLOSE`, `BEARING_ON`, `SHAFT_ON` and assert that vice commands never write to bearing/shaft tags and bearing/shaft commands never write to vice tags
    - **Validates: Requirements 1.2, 2.2, 3.1, 3.2, 3.3**
    - _Requirements: 1.2, 2.2, 3.1_

- [x] 2. Checkpoint - backend ready
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Add frontend vice command handlers
  - [x] 3.1 Add `handleViceOpen` and `handleViceClose` handlers in `Assembly.jsx`
    - Modify `frontend/src/pages/Assembly.jsx`
    - Place new handlers next to `handleBearingToggle` / `handleShaftToggle`
    - Each handler sets `isLoading` true, calls `AssemblyControlService.runCommand('VICE_OPEN')` or `'VICE_CLOSE'`, sets `lastCommand`, shows a `toast.success` on success, `toast.error` on failure, and clears `isLoading` in `finally`
    - Match the existing try/catch/finally and toast patterns used by the bearing/shaft handlers
    - _Requirements: 1.1, 2.1, 5.5_

- [x] 4. Add frontend vice control buttons
  - [x] 4.1 Add "Open Vice" and "Close Vice" buttons to the command panel
    - Modify `frontend/src/pages/Assembly.jsx`
    - Insert the new buttons inside the existing `.asm-cmd` panel that hosts the bearing/shaft buttons
    - Use `className="asm-btn asm-btn--vice-open"` for Open Vice and `className="asm-btn asm-btn--vice-close"` for Close Vice
    - Wire `onClick` to `handleViceOpen` and `handleViceClose` respectively
    - Disable Open Vice when `isLoading || isSafetyFault || !isConnected || plantData?.vice?.open === true`
    - Disable Close Vice when `isLoading || isSafetyFault || !isConnected || plantData?.vice?.close === true`
    - Show a loading indicator (e.g., text swap to "Opening..." / "Closing...") while `isLoading` is true and the user-initiated command is the vice command (use `lastCommand` or a dedicated `viceLoading` state to scope the spinner to the active button)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 5. Add vice button styling
  - [x] 5.1 Add `.asm-btn--vice-open` and `.asm-btn--vice-close` rules to `Assembly.css`
    - Modify `frontend/src/pages/Assembly.css`
    - Place new rules near the existing `.asm-btn--bearing` / `.asm-btn--shaft` block for consistency
    - Use a distinct accent color for vice (e.g., amber/yellow for open, purple/violet for close) so vice buttons read as a separate operation family from bearing/shaft
    - Mirror the bearing/shaft pattern: base color, border tint, hover state with `box-shadow` glow, and respect the existing `.asm-btn:disabled` rule for opacity
    - _Requirements: 6.1, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ]* 6. Frontend verification tests
  - [ ]* 6.1 Add unit test coverage for vice handlers in `Assembly.jsx`
    - Create or extend `frontend/src/pages/__tests__/Assembly.test.jsx` (or the project's existing test file for Assembly)
    - Mock `AssemblyControlService.runCommand`
    - Assert that clicking the "Open Vice" button calls `runCommand('VICE_OPEN')` exactly once
    - Assert that clicking the "Close Vice" button calls `runCommand('VICE_CLOSE')` exactly once
    - Assert that the Open Vice button is disabled when `plantData.vice.open === true` and Close Vice is disabled when `plantData.vice.close === true`
    - Assert that a failure response triggers `toast.error` with the error message
    - **Validates: Property 7 — Button State Management**
    - _Requirements: 6.2, 6.3, 6.4, 5.5_

- [x] 7. Final checkpoint
  - Ensure all backend and frontend tests pass, lint cleanly, and the API endpoint accepts the new commands. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP, but they implement the property tests defined in the design's Correctness Properties section.
- The API route layer (`assembly_control.py`) already validates against `HYDRAULIC_TAGS` dynamically and requires no code changes.
- The WebSocket broadcaster (`assembly_broadcaster.py`) already publishes `vice.open` / `vice.close` and requires no code changes.
- The "Vice Jaws Status" HUD in `Assembly.jsx` already renders OPEN / CLOSED / UNKNOWN from `plantData.vice.*`, so Property 6 (UI State Display) is already satisfied by the existing UI.
- Properties 3 (connection validation) and 4 (WebSocket broadcast within 100ms) are covered by existing infrastructure: `_ensure_connection` raises on connection failure, and the broadcaster polls/forwards state changes.
- Each task references specific requirement clauses for traceability.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "5.1"] },
    { "id": 1, "tasks": ["1.2", "3.1"] },
    { "id": 2, "tasks": ["1.3", "1.4", "4.1"] },
    { "id": 3, "tasks": ["6.1"] }
  ]
}
```
