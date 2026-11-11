# Portainer + ASUS DDNS when CasaOS owns port 80

This setup runs on a Docker Standalone environment managed by Portainer. It uses a Caddy gateway on **TCP 443 only**, leaving CasaOS on port 80. The range backend has no published host port. The gateway configuration is baked into a locally built image, so Portainer Web editor needs no repository checkout or relative bind mount.

The ASUS router continues updating the DDNS hostname. Caddy obtains and renews its own Let's Encrypt certificate for that hostname using **TLS-ALPN-01 on public TCP 443**. There is no certificate export/synchronization with the router. The router certificate remains separate. Do not forward port 80 to CasaOS to obtain a certificate for the range.

## 1. Build the two images on the Docker host

Open a terminal/SSH session on the same machine as the Portainer Docker environment. Clone the repository, or pull its latest main branch in your existing checkout:

```sh
git clone https://github.com/ickynk/laserrange.git
cd laserrange
sudo docker build -t laserrange:local .
sudo docker build -f deploy/Dockerfile.gateway -t laserrange-gateway:local deploy
```

The repository is private. Authenticate Git using your existing credential helper, an authorized SSH key, or a GitHub token entered at Git's password prompt. Do not put a token into the clone URL or stack YAML. If the project is already downloaded, use that updated folder and skip cloning. Use the Docker CLI without `sudo` if your account already has Docker access.

These local image tags are not published to a registry. Build them on the actual Docker host, not on a different laptop. The stack deliberately uses `pull_policy: never`; a missing image means the build step must be completed on that host.

## 2. Prepare the ASUS router

Keep the Docker host's LAN IP fixed with a DHCP reservation. Confirm **WAN → DDNS** shows your hostname registered and pointing at your public connection. Port forwarding requires a reachable public WAN IP; CGNAT or an upstream router may require a tunnel or additional forwarding.

Under **WAN → Virtual Server / Port Forwarding**, enable forwarding and add:

| Field | Value |
| --- | --- |
| Service name | LaserRange HTTPS |
| External port | 443 |
| Internal IP | Your Docker host LAN IP |
| Internal port | 443 |
| Protocol | TCP |
| Source IP | Blank (phone may use cellular/other networks) |

Keep host port 80 for CasaOS; this stack does not bind or forward it. Do not expose the range backend port 8443, Portainer, or CasaOS through this rule. Check that router WAN administration, VPN services or existing rules do not already claim external 443. Router administration does not need to be enabled from WAN for LaserRange. If a host firewall is active, allow inbound TCP 443 to the gateway.

Use a correctly routed IPv4 A record. If the DDNS hostname also publishes AAAA, that IPv6 address must reach this gateway on 443 too; an unreachable or router-only AAAA can break certificate validation. Resolve routing/DNS before repeatedly restarting certificate issuance.

## 3. Deploy in Portainer

1. Select the Docker Standalone environment for that host.
2. Open **Stacks → Add stack**, name it **laserrange**, and select **Web editor**.
3. Paste the repository's complete [compose.portainer.yaml](../compose.portainer.yaml).
4. Under **Environment variables**, add `RANGE_DOMAIN` with your exact DDNS hostname, such as `yourname.asuscomm.com`. Do not include `https://`, a port or a path.
5. Deploy the stack. Do not enable a force-pull option: both image tags are local builds.
6. Open the gateway container's logs. It should obtain a certificate once external 443 reaches it. A failed ACME challenge usually means DNS, forwarding, IPv6, firewall or CGNAT is blocking reachability. Avoid repeated volume deletion/reissuance because certificate authorities impose issuance limits.

This is a separate deployment from `compose.home.yaml`, which publishes ports 80 and 443. Use **compose.portainer.yaml** for the CasaOS arrangement. Do not run both gateways on host 443. Retain the same stack name and named volumes during updates.

## 4. Retrieve operator access and pair the phone

In Portainer, open **Containers → the laserrange range container → Console**, connect with `/bin/sh`, and run:

```sh
node scripts/host-link.js
```

Open the complete printed `https://yourname.asuscomm.com/#host=…` link on the projector/operator computer. Open **Camera**, scan the QR with the phone, tap **Connect** and enable its camera. The QR automatically uses the public hostname and includes a phone-only key. Manual six-digit-only pairing is intentionally disabled on this deployment.

Use the HTTPS hostname even at home; an IP address will not match its public certificate or the configured WebSocket origin. Enter the `https://` prefix explicitly: no port-80 HTTP redirect is provided. No phone-installed CA is needed when the public certificate is valid and trusted by the phone.

## 5. Acceptance checks

- From a phone with Wi-Fi off, open `https://yourname.asuscomm.com/api/health`; expect `{"ok":true}` and no certificate warning. This checks basic reachability, not camera accuracy or WebSocket pairing.
- Return the phone to the intended network and test QR connection, alignment, counted pulses and a longer session. Repeat at the remote location, because internet latency can affect source age/scoring confidence.
- If cellular works but home Wi-Fi fails, investigate NAT loopback or local DNS resolving that same hostname to the Docker host's LAN IP. Do not substitute an IP in the camera link.
- Confirm CasaOS still loads at its existing LAN port-80 address.
- Restart the stack and retrieve the operator link again; it should retain the key and saved ranges. Create a fresh session/QR after a server restart.

The server still runs at home, while rendering happens on the computer at the projector. Both it and the phone must reach the same HTTPS hostname. Existing data from another deployment does not automatically migrate: export/import the ranges you need or intentionally migrate its data volume while stopped.

## Updating

Pull the updated repository on the Docker host and rebuild both image tags using the commands above. In Portainer recreate/update the stack so its containers use the newly built images, **without pulling from a registry or deleting volumes**. Existing running containers do not change merely because their image tag was rebuilt. Back up the range-data and Caddy volumes before migrations; keep certificate state across updates.

References: [ASUS forwarding](https://www.asus.com/support/faq/1037906/), [Caddy TLS challenge options](https://caddyserver.com/docs/caddyfile/directives/tls), [Caddy redirect settings](https://caddyserver.com/docs/caddyfile/options), [Portainer Web editor](https://docs.portainer.io/user/docker/stacks/add).
