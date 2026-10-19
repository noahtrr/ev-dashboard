# Deployment

There are two ways to keep an instance up to date automatically. Both start only images whose Cosign signature comes from this repository's release pipeline, and both pin the verified digest in `compose.override.yaml` so an unverified image never runs.

|                       | Timer (pull)                            | SSH from GitHub Actions (push)                  |
| --------------------- | --------------------------------------- | ----------------------------------------------- |
| Trigger               | every 5 minutes, new release (`latest`) | every successful push to `main`                 |
| Credentials in GitHub | none                                    | restricted SSH key                              |
| For                   | anyone using the official image         | whoever runs the pipeline (this repo or a fork) |
| Errors show up        | in the server journal                   | as a red job in GitHub Actions                  |

Use only one of them. If the timer keeps running next to the SSH deploy, it resets the server to the latest release every 5 minutes.

## Files in `deploy/`

| File                                     | Purpose                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `install.sh`                             | installs scripts and systemd units, enables the timer                                                 |
| `ev-dashboard-update`                    | pulls an image, verifies its signature, pins the digest, restarts and waits up to 120 s for `healthy` |
| `ev-dashboard-deploy`                    | target of the SSH key (forced command), accepts only a digest                                         |
| `ev-dashboard-update.service` / `.timer` | systemd service and timer (every 5 minutes)                                                           |

## Requirements

- An installation as described in [Installation](Installation-EN) in `/opt/ev-dashboard` (with `compose.yaml` and `.env`).
- A user (default `deploy`) in the `docker` group with write access to `/opt/ev-dashboard`.

```sh
curl -fsSLO https://raw.githubusercontent.com/noahtrr/ev-dashboard/main/deploy/install.sh
sudo sh install.sh deploy
```

`install.sh` downloads the files from `deploy/` (branch via `EV_REF`, default `main`), installs them into `/usr/local/bin` and `/etc/systemd/system` and enables the timer. Run it again to update the scripts.

## Option 1: Timer

Nothing else to do after `install.sh`.

```sh
systemctl list-timers ev-dashboard-update.timer
journalctl -u ev-dashboard-update.service -n 20 --no-pager
```

After a new release the journal shows `deployed ghcr.io/…@sha256:…`. Before the first release there is no `latest` yet, and the service reports a pull error until then.

## Option 2: SSH from GitHub Actions

### How it works

1. A push lands on `main`.
2. The **Release** workflow builds the image, scans it with Trivy and signs it with Cosign. If any of that fails, nothing is deployed.
3. The **Deploy to production** job connects over SSH and sends only the image digest (`sha256:…`).
4. On the server the SSH key may only start `ev-dashboard-deploy`, which checks that exactly one digest arrived and calls `ev-dashboard-update`.
5. `ev-dashboard-update` pulls exactly that image, verifies the signature, starts the container and waits for `healthy`. If it does not become healthy, the job fails and its log shows why.

Why so restricted: membership in the `docker` group is effectively root. A plain key in GitHub would be a master key for the server. With `restrict,command=…` a stolen key can only deploy a signed image; it cannot open a shell or forward anything.

### Step 1: Install the scripts and disable the timer

```sh
curl -fsSLO https://raw.githubusercontent.com/noahtrr/ev-dashboard/main/deploy/install.sh
sudo sh install.sh deploy
sudo systemctl disable --now ev-dashboard-update.timer
systemctl list-timers ev-dashboard-update.timer   # expected: 0 timers listed
```

### Step 2: Create and authorize the deploy key

As the deploy user on the server:

```sh
ssh-keygen -t ed25519 -N '' -C github-actions-deploy -f ~/gh-deploy
printf 'restrict,command="/usr/local/bin/ev-dashboard-deploy" %s\n' "$(cat ~/gh-deploy.pub)" >> ~/.ssh/authorized_keys
tail -n 1 ~/.ssh/authorized_keys
```

The key has no passphrase because GitHub cannot type one; it exists only for this purpose. The last line must start with `restrict,command="/usr/local/bin/ev-dashboard-deploy" ssh-ed25519`.

For a fork (own image, own signature), put image and signing identity in front of the command:

```text
restrict,command="EV_IMAGE=ghcr.io/<owner>/ev-dashboard:edge EV_IDENTITY='^https://github[.]com/<owner>/ev-dashboard/[.]github/workflows/release[.]yml@refs/heads/main$' /usr/local/bin/ev-dashboard-deploy" ssh-ed25519 AAAA… github-actions-deploy
```

### Step 3: Print the values for GitHub

```sh
printf '%s %s\n' ev.example.org "$(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
cat ~/gh-deploy
```

- First output: the **host key** (use your hostname instead of `ev.example.org`). GitHub uses it to check that it is talking to your server. It comes straight from the server, so it can be trusted, unlike an `ssh-keyscan` over the network.
- Second output: the **private key**, from `-----BEGIN OPENSSH PRIVATE KEY-----` to `-----END OPENSSH PRIVATE KEY-----`.

Do not post either anywhere; enter them only in GitHub.

### Step 4: Configure GitHub

In the repository's **Settings**:

1. **Environments → New environment** `production`.
2. **Deployment branches and tags** → _Selected branches and tags_ → rule `main`. Only runs on `main` can reach the keys.
3. **Environment secrets**:
   - `DEPLOY_SSH_KEY`: private key from step 3
   - `DEPLOY_KNOWN_HOSTS`: host key line from step 3
4. **Secrets and variables → Actions → Variables**:
   - `DEPLOY_HOST`: server hostname
   - `DEPLOY_USER`: optional, default `deploy`

Without `DEPLOY_HOST` the deploy job is skipped.

### Step 5: Delete the private key from the server

```sh
rm ~/gh-deploy ~/gh-deploy.pub
```

### Step 6: Test

**Actions → Release** → latest run on `main` → **Re-run all jobs**. The **Deploy to production** job ends with `deployed …@sha256:…` or `already running …`. On the server, `docker ps --format '{{.Names}}  {{.Status}}'` then shows `(healthy)`.

## Switching and rolling back

From SSH back to the timer:

```sh
sudo systemctl enable --now ev-dashboard-update.timer
```

Then delete `DEPLOY_HOST` in GitHub and remove the `github-actions-deploy` line from `~/.ssh/authorized_keys`.

Back to a specific version: `sudo -u deploy /usr/local/bin/ev-dashboard-update sha256:<digest>` (only images signed by this repository are accepted). With SSH deploy active, the next push to `main` replaces it.

## Troubleshooting

| Message                                   | Cause and fix                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `Host key verification failed`            | `DEPLOY_KNOWN_HOSTS` does not match `DEPLOY_HOST`. Check the hostname in the line, repeat step 3.                                 |
| `Permission denied (publickey)`           | Key missing from `authorized_keys`, or `DEPLOY_SSH_KEY` is incomplete (copy the BEGIN/END lines too).                             |
| `expected an image digest`                | Something other than a digest was sent: the workflow was changed or someone is testing the key by hand.                           |
| `no matching signatures` / `verify` error | Image not signed by this repository's pipeline. For a fork set `EV_IMAGE`/`EV_IDENTITY` (step 2).                                 |
| `container not healthy after 120s`        | The new version does not start cleanly. The health output is in the job log; `docker logs ev-dashboard` on the server shows more. |
| Server jumps back to an older release     | The timer is still running. Repeat step 1 (disable the timer).                                                                    |
