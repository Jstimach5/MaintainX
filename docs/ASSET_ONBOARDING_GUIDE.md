# Asset Onboarding Guide

The fastest safe way to get your real equipment into the system. There is
no bulk *asset* importer yet (the CSV importer is for work orders) — for a
small team, entering assets through the UI with this method is faster
than debugging a spreadsheet anyway. `docs/ASSET_IMPORT_TEMPLATE.csv` is
the column list to collect the data on beforehand, and the format a
future importer will accept.

## The method (about 2 minutes per asset once you're moving)

**Prepare (once):**
1. Sites first: **Sites → New** for each physical site.
2. Locations second: **Locations → New**, building the tree top-down
   (Building → Floor → Room). You can nest freely.
3. Walk the floor with a phone or the CSV template and collect, per
   machine: name, make, model, serial number, year, where it lives, and
   the current meter reading (hours/miles) if it has one.

**Enter each asset (Assets → New):**
1. Name it the way your crew actually says it ("Air Compressor 1", not
   "Rotary screw compressor unit A-113").
2. Site, location, type, criticality, make/model/serial/year — fill what
   you know; everything is editable later.
3. Sub-assets: create the parent first (the line), then children (the
   conveyor, the labeler) picking the parent in the form.
4. Save, then on the asset page:
   - **Add a photo** (phone camera is fine — it's how technicians will
     recognize it).
   - **Add documents** (manuals, wiring diagrams) if you have them.
   - **Create a meter** if it has hours/miles/cycles, and enter the
     current reading.
   - **Print the QR label** and stick it on the machine. Scanning it
     takes staff straight to this page, and anyone else to the request
     form.

**Then wire up the maintenance:**
5. **PM plans** (PM → New plan): pick the asset, the recurrence ("every
   90 days", "every 250 hours"), and a procedure template if one applies.
   The scheduler creates the work orders from then on.
6. Create one **test work order** against the first asset and complete it
   from a phone before entering the whole fleet — docs/TEAM_ONBOARDING.md
   explains why.

## Order of entry that avoids rework

Sites → locations → teams → parent assets → sub-assets → meters →
procedures → PM plans. (Assets need their site/location to exist; PM
plans need the asset and procedure to exist.)

## Minimum viable record

If time is short: name + site + criticality is enough to start writing
work orders against. Everything else — photos, serials, meters, PM — can
be added as machines come up in real work.
