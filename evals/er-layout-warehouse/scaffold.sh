#!/usr/bin/env bash
# The shared fixture, "warehouse" (../_fixtures/shop-repo.sh): a star schema with four facts.
exec bash "$(dirname "$0")/../_fixtures/shop-repo.sh" warehouse
