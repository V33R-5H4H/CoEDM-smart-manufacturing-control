import axios from "axios";

const API_URL = `${import.meta.env.VITE_API_URL || "/api"}/control/mirac`;

class MiracControlService {
    /**
     * Connect to the MIRAC-PC OPC-UA server
     */
    static async connect() {
        try {
            const response = await axios.post(`${API_URL}/connect`);
            return response.data;
        } catch (error) {
            console.error("MIRAC Connect Error:", error);
            throw new Error(error.response?.data?.detail || "Failed to connect to MIRAC-PC");
        }
    }

    /**
     * Disconnect from the MIRAC-PC OPC-UA server
     */
    static async disconnect() {
        try {
            const response = await axios.post(`${API_URL}/disconnect`);
            return response.data;
        } catch (error) {
            console.error("MIRAC Disconnect Error:", error);
            throw new Error(error.response?.data?.detail || "Failed to disconnect from MIRAC-PC");
        }
    }

    /**
     * Get connection status of the MIRAC-PC OPC-UA server
     */
    static async getConnectionStatus() {
        try {
            const response = await axios.get(`${API_URL}/connection-status`);
            return response.data;
        } catch (error) {
            console.error("MIRAC Status Error:", error);
            throw new Error("Failed to get MIRAC-PC connection status");
        }
    }
}

export default MiracControlService;
