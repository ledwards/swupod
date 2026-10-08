#!/usr/bin/env bash
# DNS snapshot for protectthepod.com
#
# Captures DNS records by querying known names and record types. Used to
# diff DNS state before/after the migration from Squarespace DNS to Cloudflare.
#
# Usage:
#   scripts/dns-snapshot.sh [output-file] [nameserver]
#
# Examples:
#   # Snapshot from default resolver (whatever your machine uses)
#   scripts/dns-snapshot.sh
#
#   # Snapshot directly from Squarespace's auth nameservers
#   scripts/dns-snapshot.sh dns-squarespace.txt ns-cloud-e1.googledomains.com
#
#   # Snapshot directly from Cloudflare's nameservers (after migration)
#   scripts/dns-snapshot.sh dns-cloudflare.txt <your-cloudflare-ns>
#
# Then diff: diff dns-squarespace.txt dns-cloudflare.txt
#
# LIMITATION: DNS doesn't support "list all records" without zone transfer
# (which auth nameservers won't grant). This script queries a curated list
# of names. If a record exists at a name not in this list, it will be missed.
# Cross-check against the Squarespace UI before cutting nameservers.

set -euo pipefail

DOMAIN="protectthepod.com"
OUTPUT="${1:-dns-snapshot-$(date +%Y%m%d-%H%M%S).txt}"
NS="${2:-}"

DIG_ARGS=(+short +time=5 +tries=2)
if [[ -n "$NS" ]]; then
  DIG_ARGS+=("@$NS")
fi

# Names (relative to $DOMAIN — empty string = apex)
NAMES=(
  ""
  "www"
  "api"
  "admin"
  "app"
  "staging"
  "dev"
  "mail"
  "email"
  "smtp"
  "imap"
  "ftp"
  # Email-related on apex
  "_dmarc"
  "_domainkey"
  "default._domainkey"
  "google._domainkey"
  "selector1._domainkey"
  "selector2._domainkey"
  "k1._domainkey"
  "mandrill._domainkey"
  "s1._domainkey"
  "s2._domainkey"
  # Cert / verification
  "_acme-challenge"
  "_railway-verify"
  # Swag subtree (discovered in Squarespace DNS UI)
  "swag"
  "www.swag"
  "support.swag"
  "www.support.swag"
  "_dmarc.support.swag"
  "em-fw.support.swag"
  "s1._domainkey.support.swag"
  "s2._domainkey.support.swag"
  "zendeskverification.support.swag"
  "zendesk1._domainkey.support.swag"
  "zendesk2._domainkey.support.swag"
  "zendesk1.support.swag"
  "zendesk2.support.swag"
  "zendesk3.support.swag"
  "zendesk4.support.swag"
)

# Record types to query at each name
TYPES=(A AAAA CNAME MX TXT)

# Additional types only meaningful at the apex
APEX_ONLY_TYPES=(NS SOA CAA)

{
  echo "# DNS snapshot for $DOMAIN"
  echo "# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "# Nameserver: ${NS:-default resolver}"
  echo "# Script: scripts/dns-snapshot.sh"
  echo ""

  for name in "${NAMES[@]}"; do
    if [[ -z "$name" ]]; then
      fqdn="$DOMAIN"
    else
      fqdn="$name.$DOMAIN"
    fi

    # DNS quirk: a name with a CNAME cannot have other record types alongside it,
    # but the auth NS will still return the CNAME for any type query at that name.
    # To avoid noise, check for CNAME first — if present, only emit the CNAME.
    cname=$(dig "${DIG_ARGS[@]}" "$fqdn" CNAME 2>/dev/null | sort -u || true)
    if [[ -n "$cname" ]]; then
      while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        printf "%-55s %-6s %s\n" "$fqdn" "CNAME" "$line"
      done <<< "$cname"
      continue
    fi

    for type in "${TYPES[@]}"; do
      [[ "$type" == "CNAME" ]] && continue
      result=$(dig "${DIG_ARGS[@]}" "$fqdn" "$type" 2>/dev/null | sort -u || true)
      if [[ -n "$result" ]]; then
        while IFS= read -r line; do
          [[ -z "$line" ]] && continue
          printf "%-55s %-6s %s\n" "$fqdn" "$type" "$line"
        done <<< "$result"
      fi
    done
  done

  for type in "${APEX_ONLY_TYPES[@]}"; do
    result=$(dig "${DIG_ARGS[@]}" "$DOMAIN" "$type" 2>/dev/null | sort -u || true)
    if [[ -n "$result" ]]; then
      while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        printf "%-55s %-6s %s\n" "$DOMAIN" "$type" "$line"
      done <<< "$result"
    fi
  done
} | tee "$OUTPUT"

echo ""
echo "Saved to: $OUTPUT"
