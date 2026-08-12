package main

import (
	"embed"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/logger"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

// appLogger logs to ~/.config/fsgui/fsgui.log; falls back to stdout-only
// if the file cannot be created.
func appLogger() logger.Logger {
	dir, err := os.UserConfigDir()
	if err != nil {
		return logger.NewDefaultLogger()
	}
	path := filepath.Join(dir, "fsgui", "fsgui.log")
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return logger.NewDefaultLogger()
	}
	return logger.NewFileLogger(path)
}

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "FS GUI",
		Width:  1280,
		Height: 800,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour:   &options.RGBA{R: 24, G: 24, B: 27, A: 1},
		Logger:             appLogger(),
		LogLevel:           logger.INFO,
		LogLevelProduction: logger.INFO,
		OnStartup:          app.startup,
		OnShutdown:         app.shutdown,
		Linux: &linux.Options{
			Icon: appIcon,
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
