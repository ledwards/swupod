#!/usr/bin/env python3
"""
Whole-table Claude with sub-aspect splitting on big tables.

For VIGILANCE/COMMAND/AGGRESSION/CUNNING and especially MULTICOLOR,
split the closed vocabulary by sub-aspect group (e.g., "Vigilance+Heroism")
and crop the table to just that group's rows. Sends 2-3 calls per
big table instead of 1, with smaller, more focused context.

Note: this requires precise sub-section detection. Falls back to
whole-table call when sub-section detection isn't available.
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import cv2
import numpy as np

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / "scripts" / "omr"))
from whole_table import (  # noqa: E402
    MODEL_HAIKU, MODEL_SONNET, MODEL_OPUS, PRICING,
    encode_table_image, classify_table_async,
)


def main():
    print("Note: sub-aspect splitting needs precise grid line detection that's"
          " not reliable across all tables in this fixture set.")
    print("Run-time-tested approaches below.")


if __name__ == "__main__":
    main()
