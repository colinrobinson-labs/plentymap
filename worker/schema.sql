-- Plenty Map listing reports. One row per report. No IP address, device, location or account is ever stored.
CREATE TABLE IF NOT EXISTS reports (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  lid   TEXT NOT NULL,          -- our own listing id, e.g. fsd-69375945, osm-n123, snap-456, kid-dennys
  kind  TEXT NOT NULL,          -- closed | nofood | hours | address | phone | deal_ended | other
  note  TEXT,                   -- optional, max 280 characters, emails/phone numbers removed; erased after 90 days
  lang  TEXT,                   -- app language, so a note can be read (e.g. "es")
  day   TEXT NOT NULL           -- date received, YYYY-MM-DD (no time)
);
CREATE INDEX IF NOT EXISTS reports_lid ON reports (lid);
CREATE INDEX IF NOT EXISTS reports_day ON reports (day);
