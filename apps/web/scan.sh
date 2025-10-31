#!/bin/bash

BASE="https://itrade.ihsueh.com"

while read path; do
  curl -s -o /dev/null -w "%{http_code} %{url_effective}\n" \
    -A "masscan/1.0" "${BASE}${path}" &
done < paths.txt
wait
