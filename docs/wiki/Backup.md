# Backup

Every account can back up its own data and restore it into this or another installation. This does not replace backing up the whole server (see [Configuration](Configuration)), but it helps when moving to a new installation or a new account.

## Downloading a backup

Under **Account → Backup**, the card lists what the backup contains, and **Download backup** saves a JSON file (`ev-dashboard-backup-YYYY-MM-DD.json`). It contains:

- vehicles with name, usable battery capacity, home and charging losses
- all trips in the trip log with purpose and note
- all charging sessions with the price or amount entered
- electricity prices at home and away
- uploaded Excel templates
- the home page layout and the choice of notifications

It does not contain your password, passkeys, the vehicle API credentials, the consents at the provider, or the individual fetches (raw data). The file still holds personal data such as places and travel times; keep it accordingly.

## Restoring a backup

**Restore a backup → Choose file** reads the file in the browser and shows what would be added. For each vehicle in the backup you choose the target:

- **Add to “…”:** an existing vehicle. The vehicle with the same vehicle identifier or the same name is suggested.
- **Create as a new vehicle:** the vehicle is created without a connection to the provider and shows **Needs re-authorization**.
- **Do not import**

**Restore** sends the data in small parts. Trips and charging sessions that already exist (same vehicle, same start time) are skipped, as are electricity prices with the same start date and identical Excel templates. Settings of an existing vehicle and of the account are only filled in where nothing has been entered yet. If the restore is interrupted, simply start it again.

## Connecting a vehicle again

A vehicle whose consent expired, or that comes from a backup, shows **Connect again** under **Account → Vehicles**. Like the first connection, it leads to the provider's sign-in; afterwards the new consent belongs to this vehicle, and trip log, charging sessions and costs are kept. The vehicle API credentials have to be saved in this account for this.
