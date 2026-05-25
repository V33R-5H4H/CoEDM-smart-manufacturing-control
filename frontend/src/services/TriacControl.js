class TriacControlService {
  static async getConnectionStatus() {
    try {
      const response = await fetch('/api/control/triac/connection-status');
      if (!response.ok) throw new Error('Failed to fetch status');
      return await response.json();
    } catch (error) {
      console.error('Error fetching Triac connection status:', error);
      return { connected: false };
    }
  }

  static async connect() {
    const response = await fetch('/api/control/triac/connect', { method: 'POST' });
    return await response.json();
  }

  static async disconnect() {
    const response = await fetch('/api/control/triac/disconnect', { method: 'POST' });
    return await response.json();
  }
}

export default TriacControlService;
