#!/bin/bash

typeorm-model-generator \
  -h localhost \
  -d itrade \
  -p 5432 \
  -u postgres \
  -x postgres \
  -e postgres \
  -o ./src