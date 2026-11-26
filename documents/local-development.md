# Running Bigcapital locally

The full development app is configured for the local Paper Goods Demo company, with US dollars and the America/New_York timezone.

## Open the app

- App: http://localhost:4000/invoices
- Test email inbox: http://localhost:8025
- API documentation: http://localhost:3000/swagger

The demo login is stored locally in `.local-dev/demo-login.json`. This file and all local runtime configuration are ignored by Git.

Open **New Invoice** to try the invoice-entry workflow, editable Bill To and Ship To fields, payment terms, Payer view, and packing-slip downloads. Use **Manage** to select or customize an invoice template. Full workflow details are in `documents/custom-invoices.md`.

On the Invoices page, open the gear menu and choose **Customize Templates**. Open **Paper Goods Custom** to try the template that was saved through the running app, or choose **Create Invoice Branding** to create another. Layout and Columns control the form; Visual designer lets you drag sections and load a reference image.

## Invoice styles

Open http://localhost:4000/preferences/custom-form-styles to try the recording-based invoice designer. Jersey Distributors is the default reference design; Jersey Modern Green and Jersey Minimal are saved alternatives. Existing invoice templates remain available.

## Restart or stop

Run these commands from the repository root:

```sh
python3 .local-dev/manage.py status
python3 .local-dev/manage.py start
python3 .local-dev/manage.py stop
```

Stopping preserves the database and uploaded files. Starting restarts the initialized services and app processes; it does not rebuild modified source code.

## Local services and files

Colima runs a dedicated `bigcapital` Docker profile with 4 CPUs, 4 GB of RAM, and a 20 GB data disk. MariaDB, Redis, Gotenberg, Garage, and Mailpit run in the `bigcapital-local` Compose project. The frontend and API run as native Node processes using the repository's required Node 18 runtime.

The local runtime directory is `.local-dev/`. Its `runtime` link points to the downloaded official tools in the Codex workspace. Keep that link and its target intact when restarting the app. API and frontend logs are `.local-dev/server.log` and `.local-dev/webapp.log`. Database and storage credentials are in the ignored root `.env` file.

Email is delivered to the local Mailpit inbox, not an external mail provider. No real customer email addresses or financial records are required to try the editor.
