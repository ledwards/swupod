-- Privileged Observer: a host-enabled, public (no-login) live slideshow / kiosk
-- link for streaming and broadcasts. Off by default — the host must explicitly
-- enable it, because a public link to an in-progress draft exposes every seat's
-- picks and would be a cheating vector otherwise. Locking the whole draft report
-- (visibility scope=draft, reportPublic=false) also resets this to false.
ALTER TABLE pods ADD COLUMN IF NOT EXISTS observer_public BOOLEAN NOT NULL DEFAULT false;
