/**
 * HydraulicControl Service
 * Manages WebSocket connection to hydraulic data stream
 */

class HydraulicControl {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.listeners = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000; // ms
  }

  /**
   * Connect to the hydraulic data WebSocket
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        // In dev: Vite proxies ws://localhost:5173/api/... → ws://localhost:8000/api/...
        // In prod: set VITE_WS_URL=ws://your-server:8000 in frontend/.env
        const wsBase = import.meta.env.VITE_WS_URL ||
          `${protocol}//${window.location.host}`;
        const wsUrl = `${wsBase}/api/control/assembly/ws/hydraulic-data`;
        
        console.log("[HydraulicControl] Connecting to:", wsUrl);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log("[HydraulicControl] WebSocket connected");
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this._notifyListeners(data);
          } catch (error) {
            console.error("[HydraulicControl] Error parsing message:", error);
          }
        };

        this.ws.onerror = (error) => {
          console.error("[HydraulicControl] WebSocket error:", error);
          this.isConnected = false;
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("[HydraulicControl] WebSocket closed");
          this.isConnected = false;
          this._attemptReconnect();
        };
      } catch (error) {
        console.error("[HydraulicControl] Connection failed:", error);
        reject(error);
      }
    });
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  _attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.log(`[HydraulicControl] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        if (!this.isConnected) {
          this.connect().catch(err => {
            console.error("[HydraulicControl] Reconnection failed:", err);
          });
        }
      }, delay);
    }
  }

  /**
   * Subscribe to hydraulic data updates
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Notify all listeners of data update
   */
  _notifyListeners(data) {
    this.listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error("[HydraulicControl] Listener error:", error);
      }
    });
  }

  /**
   * Run a hydraulic command
   */
  async runCommand(command) {
    try {
      const response = await fetch("/api/control/assembly/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command }),
      });

      if (!response.ok) {
        throw new Error(`Command failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("[HydraulicControl] Error running command:", error);
      throw error;
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }
}

export default new HydraulicControl();
