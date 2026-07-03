import axios from "axios";

const API_URL = `${import.meta.env.VITE_API_URL || "/api"}/control/amr`;

class AmrControlService {
  /**
   * Send a dispatch command to the AMR
   * @param {string} station - e.g. 'A', 'B', 'C'
   * @returns {Promise<Object>} API response
   */
  async dispatchAMR(station) {
    try {
      const response = await axios.post(`${API_URL}/dispatch`, {
        station: station
      });
      return response.data;
    } catch (error) {
      console.error("AMR Dispatch Error:", error);
      const message =
        error.response?.data?.detail || "Failed to dispatch AMR";
      return { success: false, message: message };
    }
  }

  async connectAMR() {
    try {
      const response = await axios.post(`${API_URL}/connect`);
      return response.data;
    } catch (error) {
      console.error("AMR Connect Error:", error);
      const message = error.response?.data?.detail || "Failed to connect AMR";
      return { success: false, message: message };
    }
  }

  async disconnectAMR() {
    try {
      const response = await axios.post(`${API_URL}/disconnect`);
      return response.data;
    } catch (error) {
      console.error("AMR Disconnect Error:", error);
      const message = error.response?.data?.detail || "Failed to disconnect AMR";
      return { success: false, message: message };
    }
  }

  async getConnectionStatus() {
    try {
      const response = await axios.get(`${API_URL}/connection-status`);
      return response.data;
    } catch (error) {
      console.error("AMR Connection Status Error:", error);
      return { success: false, connected: false };
    }
  }
}

export default new AmrControlService();
