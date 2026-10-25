package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Project distribution channel. A dedicated branch isolates Eva from other widgets.
const githubReleases = "https://api.github.com/repos/youteachtk/WeekCalendarWidget/releases?per_page=100"
const releasePrefix = "eva-dock-v"
const wmUpdateReady = 0x8003

var version = "0.8.0"
var updateStaged string

type ghAsset struct {
	Name     string `json:"name"`
	Download string `json:"browser_download_url"`
	Size     int64  `json:"size"`
}
type ghRelease struct {
	Tag        string    `json:"tag_name"`
	Draft      bool      `json:"draft"`
	Prerelease bool      `json:"prerelease"`
	Assets     []ghAsset `json:"assets"`
}

func configDir() string {
	base, err := os.UserConfigDir()
	if err != nil || base == "" {
		base = os.TempDir()
	}
	return filepath.Join(base, "EvaDock")
}
func installDir() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = configDir()
	}
	return filepath.Join(base, "EvaDock")
}
func installedExe() string { return filepath.Join(installDir(), "EvaDock.exe") }

func safeCopy(dst, src string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0700)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, in)
	err2 := out.Close()
	if err != nil {
		return err
	}
	return err2
}
func firstInstallIfNeeded() bool {
	self, err := os.Executable()
	if err != nil {
		return false
	}
	dst := installedExe()
	if strings.EqualFold(filepath.Clean(self), filepath.Clean(dst)) {
		return false
	}
	if err := os.MkdirAll(installDir(), 0700); err != nil {
		return false
	}
	// A first-time installer must never overwrite a version already updated by GitHub.
	// Launch the permanent installed copy instead of downgrading it.
	if info, statErr := os.Stat(dst); statErr == nil && info.Size() > 10000 {
		makeStartMenuShortcut(dst)
		if err := exec.Command(dst, "--installed").Start(); err == nil {
			return true
		}
		logErr("No se pudo abrir la copia instalada")
		return false
	}
	if err := safeCopy(dst, self); err != nil {
		// If another running copy is present, let the current EXE start rather than crash.
		logErr("No se pudo instalar automaticamente: " + err.Error())
		return false
	}
	makeStartMenuShortcut(dst)
	cmd := exec.Command(dst, "--installed")
	if err := cmd.Start(); err != nil {
		return false
	}
	return true
}
func psString(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
func makeStartMenuShortcut(exe string) {
	appdata := os.Getenv("APPDATA")
	if appdata == "" {
		return
	}
	programs := filepath.Join(appdata, "Microsoft", "Windows", "Start Menu", "Programs")
	_ = os.MkdirAll(programs, 0700)
	link := filepath.Join(programs, "Eva Dock.lnk")
	script := "$s=(New-Object -ComObject WScript.Shell).CreateShortcut(" + psString(link) + ");" +
		"$s.TargetPath=" + psString(exe) + ";" +
		"$s.WorkingDirectory=" + psString(installDir()) + ";" +
		"$s.Description='Eva - mascota de escritorio';$s.Save()"
	_ = exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script).Run()
}

func handleUpdaterArgs() bool {
	if len(os.Args) == 4 && os.Args[1] == "--replace" {
		replaceFromHelper(os.Args[2], os.Args[3])
		return true
	}
	return false
}
func replaceFromHelper(target, pidStr string) {
	pid, _ := strconv.Atoi(pidStr)
	self, err := os.Executable()
	if err != nil {
		return
	}
	if !strings.EqualFold(filepath.Clean(target), filepath.Clean(installedExe())) {
		return
	}
	// The old process releases its EXE shortly after spawning this helper.
	newPath := target + ".next"
	oldPath := target + ".previous"
	for attempt := 0; attempt < 240; attempt++ {
		if pid > 0 && attempt < 3 {
			time.Sleep(350 * time.Millisecond)
		}
		_ = os.Remove(newPath)
		if err := safeCopy(newPath, self); err != nil {
			time.Sleep(250 * time.Millisecond)
			continue
		}
		_ = os.Remove(oldPath)
		if err := os.Rename(target, oldPath); err != nil {
			time.Sleep(250 * time.Millisecond)
			continue
		}
		if err := os.Rename(newPath, target); err != nil {
			_ = os.Rename(oldPath, target)
			time.Sleep(250 * time.Millisecond)
			continue
		}
		_ = exec.Command(target, "--installed").Start()
		// The backup is kept until the next update, so recovery is possible.
		return
	}
}
func startReplacement(downloaded string) {
	self, err := os.Executable()
	if err != nil {
		return
	}
	c := exec.Command(downloaded, "--replace", self, strconv.Itoa(os.Getpid()))
	if err := c.Start(); err != nil {
		logErr("No se pudo aplicar actualizacion: " + err.Error())
		return
	}
}
func compareVersion(v1, v2 string) int {
	a := strings.Split(strings.TrimPrefix(v1, "v"), ".")
	b := strings.Split(strings.TrimPrefix(v2, "v"), ".")
	for i := 0; i < 3; i++ {
		var x, y int
		if i < len(a) {
			x, _ = strconv.Atoi(a[i])
		}
		if i < len(b) {
			y, _ = strconv.Atoi(b[i])
		}
		if x > y {
			return 1
		}
		if x < y {
			return -1
		}
	}
	return 0
}
func httpGet(url string, max int64) ([]byte, error) {
	client := &http.Client{Timeout: 65 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "EvaDock-Desktop-Update-Client")
	req.Header.Set("Accept", "application/vnd.github+json")
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("HTTP %d", res.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, max+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > max {
		return nil, errors.New("descarga demasiado grande")
	}
	return data, nil
}
func newestRelease() (*ghRelease, *ghAsset, *ghAsset, error) {
	data, err := httpGet(githubReleases, 2<<20)
	if err != nil {
		return nil, nil, nil, err
	}
	var arr []ghRelease
	if err := json.Unmarshal(data, &arr); err != nil {
		return nil, nil, nil, err
	}
	var best *ghRelease
	var binary, checksum *ghAsset
	for _, r := range arr {
		if r.Draft || r.Prerelease || !strings.HasPrefix(r.Tag, releasePrefix) {
			continue
		}
		ver := strings.TrimPrefix(r.Tag, releasePrefix)
		if compareVersion(ver, version) <= 0 {
			continue
		}
		if best != nil && compareVersion(ver, strings.TrimPrefix(best.Tag, releasePrefix)) <= 0 {
			continue
		}
		var b, c *ghAsset
		for _, item := range r.Assets {
			x := item
			if x.Name == "EvaDock.exe" {
				b = &x
			}
			if x.Name == "EvaDock.sha256" {
				c = &x
			}
		}
		if b != nil && c != nil {
			rcopy := r
			best = &rcopy
			binary = b
			checksum = c
		}
	}
	return best, binary, checksum, nil
}
func autoUpdateCheck() {
	// Only the canonical installed copy updates itself.
	self, err := os.Executable()
	if err != nil || !strings.EqualFold(filepath.Clean(self), filepath.Clean(installedExe())) {
		return
	}
	time.Sleep(4 * time.Second)
	for {
		tryUpdate()
		time.Sleep(8 * time.Hour)
	}
}
func tryUpdate() {
	if updateStaged != "" {
		return
	}
	r, exe, sha, err := newestRelease()
	if err != nil {
		logErr("GitHub actualizaciones: " + err.Error())
		return
	}
	if r == nil {
		return
	}
	if exe.Size < 10_000 || exe.Size > 80<<20 {
		return
	}
	sums, err := httpGet(sha.Download, 1024)
	if err != nil {
		logErr("No se descargo SHA256: " + err.Error())
		return
	}
	parts := strings.Fields(string(sums))
	if len(parts) == 0 || len(parts[0]) != 64 {
		return
	}
	expected, err := hex.DecodeString(parts[0])
	if err != nil {
		return
	}
	data, err := httpGet(exe.Download, 80<<20)
	if err != nil {
		logErr("No se descargo update: " + err.Error())
		return
	}
	sum := sha256.Sum256(data)
	if !equalSHA(sum[:], expected) {
		logErr("El checksum SHA256 no coincide")
		return
	}
	target := filepath.Join(installDir(), "EvaDock_update_"+strings.TrimPrefix(r.Tag, releasePrefix)+".exe")
	if err := os.WriteFile(target, data, 0700); err != nil {
		logErr(err.Error())
		return
	}
	updateStaged = target
	if panel != 0 {
		pPostMessage.Call(panel, wmUpdateReady, 0, 0)
	}
}
func equalSHA(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	var k byte
	for i := range a {
		k |= a[i] ^ b[i]
	}
	return k == 0
}
func init() {
	// Keep Windows-only system calls in this file with the main app's DLL imports.
	_ = runtime.GOOS
}