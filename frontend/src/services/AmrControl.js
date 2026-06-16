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
}

export default new AmrControlService();
