#!/bin/bash
# Mac: double-click to start the Internet Switch and open it in your browser.
cd "$(dirname "$0")"
(sleep 2; open http://localhost:8787) &
python3 internet_switch.py
