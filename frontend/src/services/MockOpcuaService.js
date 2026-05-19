const MockOpcuaService = {
  getConnectionStatus: async () => ({ connected: true }), // mock
  connect: async () => ({ success: true, message: "Connected (mock)" }), // mock
  disconnect: async () => ({ success: true, message: "Disconnected (mock)" }), // mock
  runCommand: async (cmd) => ({ status: "TRUE (mock)" }), // mock
};

export default MockOpcuaService; // mock
