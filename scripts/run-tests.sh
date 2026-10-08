#!/bin/bash

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;36m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Emojis
CHECKMARK="✅"
CROSS="❌"
WARNING="⚠️"
ROCKET="🚀"
TROPHY="🏆"
FIRE="💥"

echo ""
echo -e "${BOLD}${PURPLE}${ROCKET} Running Test Suite${NC}"
echo -e "${PURPLE}================================${NC}"
echo ""

# Track results
TOTAL_PASSED=0
TOTAL_FAILED=0
SUITE_FAILURES=0

# Function to run a test suite
run_suite() {
  local name=$1
  local command=$2
  local emoji=$3

  echo -e "${BLUE}${emoji} Running ${name}...${NC}"

  # Run test and capture output
  output=$(eval "$command" 2>&1)
  exit_code=$?

  # Extract passed/failed counts from output
  passed=$(echo "$output" | grep -o "Tests passed: [0-9]*" | grep -o "[0-9]*" | tail -1)
  failed=$(echo "$output" | grep -o "Tests failed: [0-9]*" | grep -o "[0-9]*" | tail -1)

  # Default to 0 if not found
  passed=${passed:-0}
  failed=${failed:-0}

  TOTAL_PASSED=$((TOTAL_PASSED + passed))
  TOTAL_FAILED=$((TOTAL_FAILED + failed))

  if [ $exit_code -eq 0 ]; then
    echo -e "  ${GREEN}${CHECKMARK} Passed: ${passed}${NC}"
    if [ $failed -gt 0 ]; then
      echo -e "  ${RED}${CROSS} Failed: ${failed}${NC}"
    fi
  else
    echo -e "  ${RED}${CROSS} Failed: ${failed}${NC}"
    SUITE_FAILURES=$((SUITE_FAILURES + 1))
  fi
  echo ""
}

# Run test suites (suppress verbose output, only show summary)
run_suite "Booster Pack Tests" "npm run test:utils 2>&1" "📦"
run_suite "Belt Tests" "npm run test:belts 2>&1" "🎯"
run_suite "Data Validation" "npm run test:data 2>&1" "🎴"

# Summary
echo ""
echo -e "${PURPLE}================================${NC}"
echo -e "${BOLD}${PURPLE}Test Summary${NC}"
echo -e "${PURPLE}================================${NC}"
echo -e "${GREEN}${CHECKMARK} Total Passed: ${TOTAL_PASSED}${NC}"
if [ $TOTAL_FAILED -gt 0 ]; then
  echo -e "${RED}${CROSS} Total Failed: ${TOTAL_FAILED}${NC}"
else
  echo -e "\033[90m   Total Failed: ${TOTAL_FAILED}${NC}"
fi
if [ $SUITE_FAILURES -gt 0 ]; then
  echo -e "${YELLOW}${WARNING} Failed Suites: ${SUITE_FAILURES}${NC}"
else
  echo -e "\033[90m   Failed Suites: ${SUITE_FAILURES}${NC}"
fi
echo ""

# Final result
if [ $TOTAL_FAILED -eq 0 ] && [ $SUITE_FAILURES -eq 0 ]; then
  echo -e "${BOLD}${GREEN}${TROPHY} ALL TESTS PASSED!${NC}"
  echo ""
  exit 0
else
  echo -e "${BOLD}${RED}${FIRE} TESTS FAILED${NC}"
  echo ""
  echo "Run individual test suites for details:"
  echo "  npm run test:utils"
  echo "  npm run test:belts"
  echo "  npm run test:data"
  echo "  npm run qa"
  echo ""
  exit 1
fi
