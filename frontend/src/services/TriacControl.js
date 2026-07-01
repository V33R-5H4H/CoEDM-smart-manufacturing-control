import axios from "axios";

const API_URL = `${import.meta.env.VITE_API_URL || "/api"}/control/triac`;

class TriacControlService {
    /**
     * Connect to the TRIAC OPC-UA gateway
     */
    static async connect() {
        try {
            const response = await axios.post(`${API_URL}/connect`);
            return response.data;
        } catch (error) {
            console.error("TRIAC Connect Error:", error);
            throw new Error(error.response?.data?.detail || "Failed to connect to TRIAC");
        }
    }

    /**
     * Disconnect from the TRIAC OPC-UA gateway
     */
    static async disconnect() {
        try {
            const response = await axios.post(`${API_URL}/disconnect`);
            return response.data;
        } catch (error) {
            console.error("TRIAC Disconnect Error:", error);
            throw new Error(error.response?.data?.detail || "Failed to disconnect from TRIAC");
        }
    }

    /**
     * Get connection status of the TRIAC OPC-UA gateway
     */
    static async getConnectionStatus() {
        try {
            const response = await axios.get(`${API_URL}/connection-status`);
            return response.data;
        } catch (error) {
            console.error("TRIAC Status Error:", error);
            throw new Error("Failed to get TRIAC connection status");
        }
    }

    /**
     * Pulse start, stop, or reset command to the TRIAC machine
     */
    static async pulseCommand(action) {
        try {
            const response = await axios.post(`${API_URL}/pulse`, { action });
            return response.data;
        } catch (error) {
            console.error(`TRIAC Pulse Command Error (${action}):`, error);
            throw new Error(error.response?.data?.detail || `Failed to pulse ${action} command`);
        }
    }
}

export default TriacControlService;
