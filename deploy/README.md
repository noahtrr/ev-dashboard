# deploy/

Server-side files for automatic updates. Every image is started only after its Cosign signature has been verified against this repository's release pipeline.

| File                                                       | Purpose                                                                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `install.sh`                                               | Installs the scripts and systemd units below and enables the timer.                                                                                                     |
| `ev-dashboard-update`                                      | Pulls an image (latest release, or the digest given as argument), verifies its signature, pins the digest in `compose.override.yaml`, restarts and waits for `healthy`. |
| `ev-dashboard-deploy`                                      | SSH forced command for deploys from GitHub Actions; accepts only `sha256:<64 hex>`.                                                                                     |
| `ev-dashboard-update.service`, `ev-dashboard-update.timer` | Runs the updater every 5 minutes (pull mode).                                                                                                                           |

Setup guide (timer or SSH deploy from GitHub Actions): [Deployment](https://github.com/noahtrr/ev-dashboard/wiki/Deployment-EN) · [Deutsch](https://github.com/noahtrr/ev-dashboard/wiki/Deployment)
