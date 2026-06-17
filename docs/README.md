# SWUPOD Documentation Index

## Getting Started
- **[../CLAUDE.md](../CLAUDE.md)** - Quick reference for developers and LLMs

## Architecture & Design
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Target system architecture (layers, domains, data flow)
- **[STYLE_GUIDE.md](./STYLE_GUIDE.md)** - UI components and design tokens

## Core Systems
- **[BELTS.md](./BELTS.md)** - Belt system with seam-aware refill
- **[PACKS.md](./PACKS.md)** - Pack generation and slot allocation
- **[CARD_FIXES.md](./CARD_FIXES.md)** - Runtime card data fix system
- **[DATA_FORMATS.md](./DATA_FORMATS.md)** - Canonical pack/card data structures

## Research
- **[research/duplicate-rate-analysis.md](./research/duplicate-rate-analysis.md)** - Duplicate cards per pool, per set: theory vs. actual (powers the Duplicates tab on `/qa`)
- **[research/swudraftsim-pack-fidelity-research.md](./research/swudraftsim-pack-fidelity-research.md)** - Pack-fidelity comparison vs. SWUDraftSim

## Per-Set Documentation
- **[sets/README.md](./sets/README.md)** - Set index with block definitions and pack structure
- Individual sets: [SOR](./sets/SOR.md), [SHD](./sets/SHD.md), [TWI](./sets/TWI.md), [JTL](./sets/JTL.md), [LOF](./sets/LOF.md), [SEC](./sets/SEC.md), [LAW](./sets/LAW.md)

## Data & API
- **[../src/data/CARD_DATA_STRUCTURE.md](../src/data/CARD_DATA_STRUCTURE.md)** - Card JSON schema
- **[DATA_API_MIGRATION_2025_01.md](./DATA_API_MIGRATION_2025_01.md)** - API migration notes
- **[SWUDB_EXPORT_SPEC.md](./SWUDB_EXPORT_SPEC.md)** - SWUDB deck export format

## Features & Access
- **[BETA_ACCESS.md](./BETA_ACCESS.md)** - User roles, beta signup, pre-release sets
- **[HIDE_POOL_FEATURE.md](./HIDE_POOL_FEATURE.md)** - Hide/show pools in history
- **[PACK_QUALITY_DASHBOARD.md](./PACK_QUALITY_DASHBOARD.md)** - Public pack stats transparency page

## CI/CD & Deployment
- **[CI_CD.md](./CI_CD.md)** - CI/CD pipeline details
- **[CI_CD_QUICKSTART.md](./CI_CD_QUICKSTART.md)** - Quick setup guide
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Pre-deployment checks

## Card Fixes Guides
- **[QUICKSTART_FIXES.md](./QUICKSTART_FIXES.md)** - How to add card fixes (TL;DR)
- **[EXAMPLE_ADDING_FIX.md](./EXAMPLE_ADDING_FIX.md)** - Example fix walkthrough
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - Card fixes implementation details

## Development History
- **[DEV_LOG.md](./DEV_LOG.md)** - Running development log
- **[QA_STATUS.md](./QA_STATUS.md)** - QA test results (auto-generated)

## Completed Plans
These were originally in `plans/` and moved here after implementation:
- **[DECKBUILDER_REFACTOR_PLAN.md](./DECKBUILDER_REFACTOR_PLAN.md)** - DeckBuilder refactor (6700 to 2030 lines)
- **[COMPONENT_EXTRACTION_PLAN.md](./COMPONENT_EXTRACTION_PLAN.md)** - Component library extraction
- **[HIDE_POOLS_PLAN.md](./HIDE_POOLS_PLAN.md)** - Hide pools feature spec
- **[HYPERSPACE_BELT_PLAN.md](./HYPERSPACE_BELT_PLAN.md)** - Hyperspace upgrade belt system

---

## Future Plans
Planning documents for unimplemented features are in **[../plans/](../plans/README.md)**.
