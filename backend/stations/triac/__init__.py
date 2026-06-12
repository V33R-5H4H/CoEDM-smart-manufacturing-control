# TRIAC station package
from .cnc_triac_station import (
    opcua_connection as triac_opcua_connection,
    connect_triac,
    disconnect_triac,
    get_triac_status,
)
