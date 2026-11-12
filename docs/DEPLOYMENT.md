# Portable and home-hosted deployment

Laser Range has two deployment paths. The computer/tablet at the projector still renders the range in its browser; the server provides the app, saves range files and relays phone events/reference images. A remote server does not replace the local projector display or stream its desktop. Open the operator and separate projector window on the same local computer as before.

| Setup | Best fit | Requires |
| --- | --- | --- |
| Portable LAN launcher | Travel kit, offline 3D/local-video use | Node.js 22+, local Wi-Fi/router, trusted LAN certificate on each phone |
| Home Docker + existing HTTPS proxy/tunnel | Existing Docker/Portainer/home-server installation | Docker Compose, stable reachable HTTPS origin, WebSocket forwarding |
| Home Docker + bundled Caddy | Public domain pointing to home | Docker Compose, DNS and inbound TCP 80/443 |

## Portable kit: first setup

1. Download/clone this private repository onto the host computer. Install Node.js 22 or newer and [mkcert](https://github.com/FiloSottile/mkcert).
2. Windows: open **Start-Laser-Range.cmd**. macOS: open **Start-Laser-Range.command** (if necessary first run `chmod +x Start-Laser-Range.command`). Linux: `sh Start-Laser-Range.command` or `npm run launch`.
3. The launcher installs dependencies on first use, then offers setup. Choose **1 — Portable LAN** and the host's Wi-Fi/Ethernet IPv4 address from the detected list. VPN/virtual adapters may also be listed; choose the network the phone uses.
4. Let setup run mkcert to generate certificates. The OS may request permission to install the local CA. The wizard prints its CA folder. Transfer **only `rootCA.pem`** to the phone by a trusted method; never transfer `rootCA-key.pem`. On iPhone install the certificate profile and enable full trust under Settings → General → About → Certificate Trust Settings. Android trust menus vary. See [SETUP.md](SETUP.md).
5. Keep the launcher open and open its printed operator link, including `#host=…`. Allow TCP 8443 through the computer firewall on the private network. Scan the QR from Camera, tap Connect, allow camera access and calibrate.

Subsequent launches reuse `range.config.json`, certificates and the operator key. Setup can also be run directly with `npm run setup`; start normally with `npm start`. `npm run host:link` retrieves the operator link without restarting the server.

For a reliable travel kit, use a small travel router with a reserved host address. Join the phone and display computer to that router. Once dependencies/certificates are installed, 3D and local video work without internet. YouTube and browser speech recognition may require internet. This is a Node-based launcher, not a bundled native executable or an offline dependency installer.

If the network address changes, **stop the server, run `npm run setup` again**, select the new address and regenerate the leaf certificate. Keep the same mkcert CA so previously trusted phones do not need a new CA. Startup validates certificate dates, key pairing and coverage of the configured address. It cannot remotely verify that the phone trusts the CA. A browser certificate warning is not a successful camera setup.

Keep `range.config.json`, `certs/`, and `data/` when updating the app; do not commit/share them. The local mkcert CA lives outside the project. Moving to a different host may require a new CA/phone trust setup. Browser-only quick saves/test history remain tied to that browser and origin; save important ranges to the host folder before moving.

## Home server with an existing HTTPS proxy or tunnel

Use this option with your existing home proxy, or an HTTPS-capable private-network/tunnel service. The exact external setup depends on your provider. Both the operator and phone must be able to reach the configured HTTPS address. If access is private/VPN-only, connect **both devices** to that network before opening the app or scanning the QR.

From the project directory:

```sh
# Copy the example to the Git-ignored local configuration file.
cp deploy/home.env.example deploy/home.env
# Edit PUBLIC_ORIGIN in that file, e.g. https://range.example.com

docker compose --env-file deploy/home.env up -d --build
docker compose --env-file deploy/home.env exec range node scripts/host-link.js
```

Windows PowerShell can use `Copy-Item deploy/home.env.example deploy/home.env` for the copy step. Set `PUBLIC_ORIGIN` to an **HTTPS origin only**: no `/phone`, other path, query or fragment. Root-domain/subdomain hosting is supported; deployment beneath a URL path is not.

Point your trusted HTTPS proxy/tunnel to `http://127.0.0.1:8443`, forwarding WebSocket upgrades without short idle timeouts. The Compose file binds that backend to loopback only; do not forward port 8443 from your router. If the proxy is itself a container, its `127.0.0.1` is not the Docker host: join the proxy and range service to a private shared Docker network and proxy to `range:8443`, removing the host port mapping if not needed. Preserve the public Origin header. Laser Range uses the explicitly configured origin and does not trust arbitrary forwarded headers.

For a non-Docker installation, run `npm ci`, then `npm run setup`, choose mode 2 and enter the external origin. The wizard binds Node to loopback and requires secure phone keys. Configure the proxy/tunnel and run `npm start`.

For Portainer, deploy the Compose content from this repository with access to the complete build context, or build the image on your Docker host first and use that image in a stack. Pasting the Compose YAML alone into an unrelated stack directory cannot satisfy `build: .` or the Caddyfile mount. No prebuilt public image is published by this revision.

## Portainer when CasaOS already uses port 80

Use the [Portainer + ASUS DDNS guide](PORTAINER.md) and `compose.portainer.yaml`. That variant publishes only TCP 443 and validates/renews its certificate over 443, leaving CasaOS on port 80. Its gateway configuration is built into an image so the Web editor needs no relative bind mount.

## Home server with bundled automatic HTTPS

Use a DNS name you control, for example `range.example.com`. Point its A record (and AAAA only if correctly routed) at your home connection. Arrange dynamic DNS if your public IP changes. Forward TCP **80 and 443** to the Docker host. Caddy obtains/renews the public certificate and forwards HTTP/WebSocket requests to the internal range service. See [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https) and [reverse proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

```sh
cp deploy/home.env.example deploy/home.env
# Edit RANGE_DOMAIN to the hostname only: range.example.com

docker compose --env-file deploy/home.env -f compose.home.yaml up -d --build
docker compose --env-file deploy/home.env -f compose.home.yaml exec range node scripts/host-link.js
```

Open the printed HTTPS operator link. The camera QR uses that same public origin. Test it on the phone with Wi-Fi temporarily disabled to confirm outside access. Then return the phone to the best network for the range.

Use **one** Compose variant at a time; do not run both commands to create competing deployments. Keep the same project directory/Compose project name so named volumes remain attached.

If your ISP uses CGNAT, blocks incoming ports, or your router cannot forward them, use the existing-proxy/tunnel option instead. If the public domain works externally but not on home Wi-Fi, configure router NAT loopback or split DNS so the same domain reaches your server internally. The certificate and URL should remain the same. DNS, router changes, domain registration, tunnel accounts and paid services are not provisioned by these files.

## Operator access, phone pairing and persistence

- On normal startup the server creates `data/admin-token` once with restricted file permissions and reuses it across restarts. The printed operator link unlocks session creation and saved ranges. Keep it private, including in screenshots. Normal server/container startup no longer prints this link; retrieve it explicitly with `node scripts/host-link.js`. The interactive portable launcher still displays it for the operator. Optionally supply a 32–128 character URL-safe `ADMIN_TOKEN` via the environment instead.
- The QR/full phone link contains a random **phone-only session key** in its URL fragment. It does not grant operator/library access. The phone removes the fragment from the address bar after reading it. Do not share the QR publicly.
- Both home deployment presets require that key; entering only the six-digit code is disabled. Portable LAN mode retains manual code pairing. Scan a fresh QR after a server restart/new operator session, or reopen the full phone link after refreshing the phone. Automatic network reconnect within the page retains its credentials.
- `REQUIRE_PHONE_TOKEN=true` can also be set for a manual deployment with an HTTPS `PUBLIC_ORIGIN`. A supplied incorrect key cannot fall back to guessing the code.
- The server still supports one phone per operator session. Range controls do not become available merely by loading the public home page.
- Saved ranges and video links persist in the `range-data` volume, including the operator key. Local-video files, browser quick saves, shot-review history and test history are **not** server backups. Uploaded video files must be selected on the operator computer; saved YouTube links still require internet.

To rotate the default operator key, stop the server, remove `admin-token` from its data directory/volume, then restart and retrieve the new link. If using `ADMIN_TOKEN`, replace that environment value and restart instead. Server restarts end all current sessions and invalidate phone keys; scan a new QR afterward.

## Updates, backup and troubleshooting

Update the source, then repeat the chosen `docker compose … up -d --build` command. Retrieve the operator link with the matching `exec` command if needed. In portable mode run `npm ci` after updating dependencies and reopen the launcher. Refresh all browser tabs after updates.

Back up the complete `data` directory or `range-data` volume while stopped, including its private operator key. Preserve `caddy-data` and `caddy-config` for the bundled gateway's certificate state. Never use `docker compose down -v` unless intentionally deleting stored data. A normal `down` retains named volumes. The app runs as the unprivileged `node` user; custom bind mounts must be writable by that user.

| Symptom | Check |
| --- | --- |
| Phone camera API unavailable | HTTPS certificate trust, exact hostname and camera permissions |
| QR works locally but not remotely | Public DNS/tunnel/VPN access, router forwarding, firewall; never a LAN IP in a remote QR |
| Origin mismatch | Operator and phone use exactly `PUBLIC_ORIGIN`; restart after changing it |
| Six-digit code rejected on home deployment | Scan QR or open the complete phone link; key-required pairing is intentional |
| Proxy container cannot reach backend | Shared Docker network/service hostname rather than container loopback |
| Gateway cannot obtain a certificate | DNS including AAAA, public 80/443 reachability and ISP CGNAT; inspect gateway logs |
| Saved ranges appear missing after redeploy | Correct Compose project name/data volume; do not delete the old volume |
| Connection works but source age increases | WAN latency/bandwidth; compare Range Health and run hardware tests at the actual location |

A home-hosted range sends reference frames and shot messages through the home server. Internet upload, latency and interruptions can affect timing/scoring confidence even when graphics render smoothly locally. Source frames may contain target imagery, and shot-review messages may contain camera-derived screen images; the server relays them without recording them. Use local hosting for offline or lowest-latency operation. Validate placement, counted pulses, no-fire behavior, reconnect and a longer session in the actual remote setup before relying on it.

## Configuration reference

Environment variables override `range.config.json`. `RANGE_CONFIG` selects another config file. Relative certificate/data paths resolve from the project directory.

| Name | Meaning / default |
| --- | --- |
| `PORT` | Backend listen port, 8443 |
| `BIND` | Listen address, 0.0.0.0; wizard demo/proxy mode uses 127.0.0.1 |
| `PUBLIC_ORIGIN` | Canonical browser HTTPS origin for QR and WebSocket origin checking |
| `TLS_CERT`, `TLS_KEY` | Both required for direct TLS; omitted behind an HTTPS gateway |
| `RANGE_DATA_DIR` | Writable server data folder; `data`, or `/app/data` in Docker |
| `REQUIRE_PHONE_TOKEN` | `true` for key-only phone pairing, `false` for optional manual code |
| `ADMIN_TOKEN` | Optional externally managed operator key; otherwise persisted in data folder |

Container presets use HTTP internally on port 8443 and HTTPS at the gateway. Do not override the internal port/TLS settings without also updating the proxy, port mapping and container health check.
