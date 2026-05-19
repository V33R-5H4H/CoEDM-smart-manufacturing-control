import axios from "axios";

// VITE_API_URL defaults to /api (relative) so Vite proxies it to localhost:8000 in dev.
// Set VITE_API_URL=https://your-server.com/api in frontend/.env for production.
const API_URL = `${import.meta.env.VITE_API_URL || "/api"}/control/assembly`;

class AssemblyControlService {
  /**
   * Send an assembly (hydraulic) command
   * @param {string} command - e.g. 'BEARING_ON', 'SHAFT_ON'
   * @returns {Promise<Object>} API response
   */
  static async runCommand(command) {
    try {
      const response = await axios.post(`${API_URL}/run`, {
        command: command
      });
      return response.data;
    } catch (error) {
      console.error("Assembly Control Error:", error);
      const message =
        error.response?.data?.detail || "Failed to execute assembly command";
      throw new Error(message);
    }
  }

  /**
   * Connect to the hydraulic OPC-UA server
   */
  static async connect() {
    const response = await axios.post(`${API_URL}/connect`);
    return response.data;
  }

  /**
   * Disconnect from the hydraulic OPC-UA server
   */
  static async disconnect() {
    const response = await axios.post(`${API_URL}/disconnect`);
    return response.data;
  }

  /**
   * Get connection status of the hydraulic OPC-UA server
   */
  static async getConnectionStatus() {
    const response = await axios.get(`${API_URL}/connection-status`);
    return response.data;
  }
}

export default AssemblyControlService;
