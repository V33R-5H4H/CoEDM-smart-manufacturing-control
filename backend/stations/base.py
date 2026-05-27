"""
backend/stations/base.py — Base Station Class
==============================================

Abstract base class for all station implementations.
Provides common functionality and enforces a consistent interface.
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
import logging


class BaseStation(ABC):
    """
    Abstract base class for all station implementations.
    
    Subclasses must implement:
    - connect()
    - disconnect()
    - get_status()
    - read_data()
    - send_command()
    """
    
    def __init__(self, name: str, machine_id: str):
        """
        Initialize the station.
        
        Args:
            name: Human-readable station name
            machine_id: Unique identifier for this station in the database
        """
        self.name = name
        self.machine_id = machine_id
        self.connected = False
        self.logger = logging.getLogger(f"stations.{name.lower()}")
    
    @abstractmethod
    async def connect(self) -> Dict[str, Any]:
        """
        Connect to the station hardware.
        
        Returns:
            Dict with 'success' boolean and 'message' string
        """
        pass
    
    @abstractmethod
    async def disconnect(self) -> Dict[str, Any]:
        """
        Disconnect from the station hardware.
        
        Returns:
            Dict with 'success' boolean and 'message' string
        """
        pass
    
    @abstractmethod
    async def get_status(self) -> Dict[str, Any]:
        """
        Get the current status of the station.
        
        Returns:
            Dict with station status information
        """
        pass
    
    @abstractmethod
    async def read_data(self) -> Dict[str, Any]:
        """
        Read current data from the station.
        
        Returns:
            Dict with station data
        """
        pass
    
    @abstractmethod
    async def send_command(self, command: str) -> Dict[str, Any]:
        """
        Send a command to the station.
        
        Args:
            command: Command string to send
            
        Returns:
            Dict with command result
        """
        pass
    
    def is_connected(self) -> bool:
        """
        Check if the station is currently connected.
        
        Returns:
            True if connected, False otherwise
        """
        return self.connected
    
    def get_info(self) -> Dict[str, str]:
        """
        Get station information.
        
        Returns:
            Dict with name and machine_id
        """
        return {
            "name": self.name,
            "machine_id": self.machine_id,
            "connected": self.connected
        }