//go:build !eva_assets

package main

import "os"

func bundledAsset(name string) ([]byte, error) { return nil, os.ErrNotExist }