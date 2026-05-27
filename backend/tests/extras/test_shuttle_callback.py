import pytest
from unittest.mock import MagicMock, patch
from backend.stations.asrs.asrs_station import ASRSController

@patch("backend.stations.asrs.asrs_station.asrs_connection")
@patch("backend.stations.asrs.asrs_station.ShuttleState")
@patch("backend.stations.asrs.asrs_station.LEDService")
def test_on_led_state_change_store_complete(mock_led_service, mock_shuttle_state, mock_connection):
    # Setup mocks
    shuttle_mock = MagicMock()
    mock_shuttle_state.return_value = shuttle_mock
    shuttle_mock.snapshot.return_value = {
        "row": 1,
        "column": "A",
        "state": "busy",
        "command": "A1S"
    }

    controller = ASRSController()
    
    # Trigger the callback with a True -> False edge transition for target box A1
    controller._on_led_state_change("A1", active=False, prev=True)
    
    # Assert set_idle was called
    shuttle_mock.set_idle.assert_called_once()
    shuttle_mock.return_to_dropoff.assert_not_called()

@patch("backend.stations.asrs.asrs_station.asrs_connection")
@patch("backend.stations.asrs.asrs_station.ShuttleState")
@patch("backend.stations.asrs.asrs_station.LEDService")
def test_on_led_state_change_retrieve_complete(mock_led_service, mock_shuttle_state, mock_connection):
    # Setup mocks
    shuttle_mock = MagicMock()
    mock_shuttle_state.return_value = shuttle_mock
    shuttle_mock.snapshot.return_value = {
        "row": 1,
        "column": "A",
        "state": "busy",
        "command": "A1"
    }

    controller = ASRSController()
    
    # Trigger the callback with a True -> False edge transition for target box A1
    controller._on_led_state_change("A1", active=False, prev=True)
    
    # Assert return_to_dropoff was called
    shuttle_mock.return_to_dropoff.assert_called_once()
    shuttle_mock.set_idle.assert_not_called()
