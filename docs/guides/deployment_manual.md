# Deployment & VM Connection Manual

This manual provides step-by-step instructions on how the CoEDM Smart Manufacturing Control system is deployed, how to connect to the production Virtual Machine (VM), and how to manage the Docker containers.

---

## 1. Connecting to the Production Virtual Machine

The production environment is hosted on a Virtual Machine (typically running on a XenServer or similar hypervisor) on the factory's local network.

### SSH Access
To access the VM terminal, you need to be on the local factory network (or connected via the facility VPN).

1. Open your local terminal (Command Prompt, PowerShell, or macOS/Linux terminal).
2. Run the SSH command using the VM's IP address and the provided admin credentials:
   ```bash
   ssh <username>@<vm-ip-address>
   ```
   *(Example: `ssh admin@192.168.1.50`)*
3. Enter the password when prompted. 
4. You are now connected to the production VM terminal.

---

## 2. System Prerequisites on the VM

The VM has been pre-configured with the following essential software to run the system:
- **Git:** For cloning and pulling the latest repository code.
- **Docker Engine:** For running isolated containers.
- **Docker Compose (v2):** For orchestrating the multi-container setup (Backend, Frontend, E-Commerce, PostgreSQL).

---

## 3. The Deployment Process (Docker Compose)

The entire software stack is containerized. We use a `.env.docker` file to inject environment variables securely without hardcoding them into the codebase.

### Step 3.1: Pulling the Latest Code
If you are deploying a new update manually:
1. SSH into the VM.
2. Navigate to the project directory:
   ```bash
   cd /path/to/CoEDM
   ```
3. Pull the latest code from the `main` or `develop` branch:
   ```bash
   git pull origin main
   ```

### Step 3.2: Configuring Environment Variables
Ensure the `.env.docker` file is present in the root directory (`d:\CoEDM` locally, or `/path/to/CoEDM` on the VM). This file contains the database passwords, OPC-UA server URLs, and API keys.
*Note: Never commit the production `.env.docker` file to version control.*

### Step 3.3: Building and Starting the Containers
To deploy the system, run the Docker Compose command. The `-d` flag runs the containers in the background (detached mode).

```bash
docker compose --env-file .env.docker up -d --build
```
- `--build`: Forces Docker to rebuild the container images if there were changes to the `Dockerfile` or source code.
- `--env-file .env.docker`: Explicitly tells Compose to use the Docker-specific environment file.

### Step 3.4: Verifying the Deployment
Once the command finishes, check if all containers are running successfully:
```bash
docker ps
```
You should see active containers for:
- `coedm_backend` (FastAPI / Python)
- `coedm_db` (PostgreSQL / TimescaleDB)
- `coedm_frontend_admin` (React Dashboard)
- `coedm_frontend_ecom` (React Storefront)

---

## 4. Viewing Logs and Troubleshooting

If a service crashes or the UI isn't updating, you can view the live logs directly from the VM.

- **To view backend API logs (Hardware communication, OPC-UA errors, WebSockets):**
  ```bash
  docker logs -f coedm_backend
  ```
- **To view database logs:**
  ```bash
  docker logs -f coedm_db
  ```
*(Press `Ctrl + C` to exit the log viewer)*

## 5. Stopping the System
If you need to completely shut down the software stack (e.g., for major maintenance):
```bash
docker compose --env-file .env.docker down
```
This stops and removes the containers but **preserves the database volumes**, so no historical orders or telemetry data are lost.
