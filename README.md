# EV Dashboard

A self-hostable, modular web app that visualizes data from your electric vehicle.

- **One container:** a slim all-in-one image with the app, SQLite and Caddy (automatic HTTPS).
- **Configured through `.env`:** no config files to edit.
- **Hardened supply chain:** scanned, signed and attested images for amd64 and arm64.

> Status: early. Sign-in works (email, passkey, GitHub, Google, OIDC); vehicles can be connected and are polled in the background; the home page shows location, address, range and state of charge, with a charging history and a trip log.

## Quick start

```sh
curl -fsSLO https://raw.githubusercontent.com/noahtrr/ev-dashboard/main/compose.yaml
curl -fsSL -o .env https://raw.githubusercontent.com/noahtrr/ev-dashboard/main/.env.example
mkdir data && sudo chown 10001:10001 data
# edit .env (APP_URL, ACME_EMAIL)
docker compose up -d
```

## Documentation

Everything else lives in the [wiki](https://github.com/noahtrr/ev-dashboard/wiki) (German and English): installation, configuration, deployment, architecture, design philosophy, security and development.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
