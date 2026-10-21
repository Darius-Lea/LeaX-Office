//go:build windows

package main

import (
	"archive/zip"
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	_ "embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/go-ole/go-ole"
	"github.com/go-ole/go-ole/oleutil"
	"github.com/lxn/walk"
	. "github.com/lxn/walk/declarative"
	"golang.org/x/sys/windows"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

//go:embed payload.zip
var payload []byte

//go:embed database-restore.mjs
var databaseHelper []byte

const nodeVersion = "24.19.0"

var root string
var window *walk.MainWindow
var statusLabel *walk.Label
var keyInput *walk.LineEdit
var startButton, stopButton *walk.PushButton
var shortcut *walk.CheckBox
var busy atomic.Bool
var client = &http.Client{Timeout: 3 * time.Minute}

type state struct {
	PID                             int
	Executable, App, Created, Setup string
}
type localStatus struct {
	Product       string `json:"product"`
	SetupRequired bool   `json:"setupRequired"`
}

func utf(s string) *uint16 { return syscall.StringToUTF16Ptr(s) }
func hidden(c *exec.Cmd) {
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}
func progress(s string) { window.Synchronize(func() { statusLabel.SetText(s) }) }
func info(s string) {
	window.Synchronize(func() { walk.MsgBox(window, "AI Headquarters", s, walk.MsgBoxIconInformation) })
}
func runOperation(f func() error) {
	if !busy.CompareAndSwap(false, true) {
		return
	}
	startButton.SetEnabled(false)
	stopButton.SetEnabled(false)
	go func() {
		err := f()
		window.Synchronize(func() {
			busy.Store(false)
			startButton.SetEnabled(true)
			stopButton.SetEnabled(true)
			if err != nil {
				statusLabel.SetText("Setup needs attention. Saved business data was kept.")
				walk.MsgBox(window, "Action needed", err.Error(), walk.MsgBoxIconError)
			}
		})
	}()
}
func fileSHA(p string) (string, error) {
	f, e := os.Open(p)
	if e != nil {
		return "", e
	}
	defer f.Close()
	h := sha256.New()
	_, e = io.Copy(h, f)
	return hex.EncodeToString(h.Sum(nil)), e
}
func writePrivate(path string, data []byte) error {
	temp := path + ".new"
	if e := os.WriteFile(temp, data, 0600); e != nil {
		return e
	}
	return windows.MoveFileEx(utf(temp), utf(path), windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_WRITE_THROUGH)
}
func protectFolder() error {
	if e := os.MkdirAll(root, 0700); e != nil {
		return e
	}
	token, e := windows.OpenCurrentProcessToken()
	if e != nil {
		return e
	}
	defer token.Close()
	user, e := token.GetTokenUser()
	if e != nil {
		return e
	}
	cmd := exec.Command(filepath.Join(os.Getenv("SystemRoot"), "System32", "icacls.exe"), root, "/inheritance:r", "/grant:r", "*"+user.User.Sid.String()+":(OI)(CI)F", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F")
	hidden(cmd)
	if e = cmd.Run(); e != nil {
		return errors.New("Windows could not protect your private local folder. No permissions were relaxed.")
	}
	return os.MkdirAll(filepath.Join(root, "data"), 0700)
}

type blob struct {
	Size uint32
	Data *byte
}

func dpapi(data []byte, decrypt bool) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("Empty private value")
	}
	in := blob{uint32(len(data)), &data[0]}
	var out blob
	dll := syscall.NewLazyDLL("crypt32.dll")
	name := "CryptProtectData"
	if decrypt {
		name = "CryptUnprotectData"
	}
	r, _, e := dll.NewProc(name).Call(uintptr(unsafe.Pointer(&in)), 0, 0, 0, 0, 1, uintptr(unsafe.Pointer(&out)))
	if r == 0 {
		return nil, e
	}
	defer syscall.NewLazyDLL("kernel32.dll").NewProc("LocalFree").Call(uintptr(unsafe.Pointer(out.Data)))
	return append([]byte(nil), unsafe.Slice(out.Data, out.Size)...), nil
}
func seal(s string) (string, error) {
	b, e := dpapi([]byte(s), false)
	return base64.StdEncoding.EncodeToString(b), e
}
func unseal(s string) (string, error) {
	b, e := base64.StdEncoding.DecodeString(s)
	if e != nil {
		return "", e
	}
	b, e = dpapi(b, true)
	return string(b), e
}
func readState() state {
	var s state
	b, e := os.ReadFile(filepath.Join(root, "native-state.json"))
	if e == nil {
		json.Unmarshal(b, &s)
	}
	return s
}
func saveState(s state) error {
	b, e := json.Marshal(s)
	if e != nil {
		return e
	}
	return writePrivate(filepath.Join(root, "native-state.json"), b)
}
func processIdentity(pid int) (string, string, error) {
	h, e := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if e != nil {
		return "", "", e
	}
	defer windows.CloseHandle(h)
	b := make([]uint16, 32768)
	size := uint32(len(b))
	if e = windows.QueryFullProcessImageName(h, 0, &b[0], &size); e != nil {
		return "", "", e
	}
	var created, exit, kernel, user windows.Filetime
	if e = windows.GetProcessTimes(h, &created, &exit, &kernel, &user); e != nil {
		return "", "", e
	}
	return syscall.UTF16ToString(b[:size]), fmt.Sprint(uint64(created.HighDateTime)<<32 | uint64(created.LowDateTime)), nil
}
func owned(s state) bool {
	p, c, e := processIdentity(s.PID)
	return e == nil && strings.EqualFold(p, s.Executable) && c == s.Created
}
func getStatus() (localStatus, error) {
	var s localStatus
	c := http.Client{Timeout: 2 * time.Second, Transport: &http.Transport{Proxy: nil}}
	r, e := c.Get("http://127.0.0.1:4310/api/status")
	if e != nil {
		return s, e
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return s, errors.New("Local port is not ready")
	}
	e = json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&s)
	if s.Product != "ai-headquarters" {
		return s, errors.New("Port 4310 belongs to another application; it was not changed")
	}
	return s, e
}
func openItem(target string) error {
	r, _, e := syscall.NewLazyDLL("shell32.dll").NewProc("ShellExecuteW").Call(0, uintptr(unsafe.Pointer(utf("open"))), uintptr(unsafe.Pointer(utf(target))), 0, 0, 1)
	if r <= 32 {
		return e
	}
	return nil
}
func openOffice(s state, st localStatus) error {
	url := "http://127.0.0.1:4310/"
	if st.SetupRequired {
		if !owned(s) || s.Setup == "" {
			return errors.New("A local office was started by another launcher. Finish its original setup or stop it there; no process was replaced")
		}
		code, e := unseal(s.Setup)
		if e != nil {
			return errors.New("Windows could not unlock this setup code for the current user")
		}
		url += "#setup=" + code
	} else if s.Setup != "" {
		s.Setup = ""
		saveState(s)
	}
	return openItem(url)
}
func fetch(url, path string, max int64) error {
	r, e := client.Get(url)
	if e != nil {
		return errors.New("The official HTTPS download could not be reached. Check internet access; TLS verification was not disabled")
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return fmt.Errorf("Official download returned HTTP %d", r.StatusCode)
	}
	f, e := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if e != nil {
		return e
	}
	n, e := io.Copy(f, io.LimitReader(r.Body, max+1))
	f.Close()
	if e != nil {
		return e
	}
	if n > max {
		os.Remove(path)
		return errors.New("Official download exceeded its size limit")
	}
	return nil
}
func unzip(data []byte, destination string) error {
	reader, e := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if e != nil {
		return e
	}
	for _, entry := range reader.File {
		p := filepath.Join(destination, filepath.FromSlash(entry.Name))
		relative, e := filepath.Rel(destination, p)
		if e != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || entry.Mode()&os.ModeSymlink != 0 {
			return errors.New("Unsafe archive path")
		}
		if entry.FileInfo().IsDir() {
			if e = os.MkdirAll(p, 0700); e != nil {
				return e
			}
			continue
		}
		if entry.UncompressedSize64 > 150*1024*1024 {
			return errors.New("Archive entry exceeds size limit")
		}
		if e = os.MkdirAll(filepath.Dir(p), 0700); e != nil {
			return e
		}
		input, e := entry.Open()
		if e != nil {
			return e
		}
		output, e := os.OpenFile(p, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if e != nil {
			input.Close()
			return e
		}
		_, e = io.Copy(output, io.LimitReader(input, 150*1024*1024+1))
		output.Close()
		input.Close()
		if e != nil {
			return e
		}
	}
	return nil
}

type wintrustFile struct {
	Size    uint32
	Path    *uint16
	Handle  uintptr
	Subject uintptr
}
type wintrustData struct {
	Size                  uint32
	Policy, SIP           uintptr
	UI, Revocation, Union uint32
	File                  uintptr
	Action                uint32
	State                 uintptr
	URL                   uintptr
	Flags, Context        uint32
	Signature             uintptr
}

func verifyNode(path string) error {
	file := wintrustFile{Path: utf(path)}
	file.Size = uint32(unsafe.Sizeof(file))
	data := wintrustData{UI: 2, Revocation: 1, Union: 1, File: uintptr(unsafe.Pointer(&file)), Action: 1}
	data.Size = uint32(unsafe.Sizeof(data))
	action := windows.GUID{Data1: 0x00aac56b, Data2: 0xcd44, Data3: 0x11d0, Data4: [8]byte{0x8c, 0xc2, 0, 0xc0, 0x4f, 0xc2, 0x95, 0xee}}
	verify := syscall.NewLazyDLL("wintrust.dll").NewProc("WinVerifyTrust")
	r, _, _ := verify.Call(0, uintptr(unsafe.Pointer(&action)), uintptr(unsafe.Pointer(&data)))
	data.Action = 2
	verify.Call(0, uintptr(unsafe.Pointer(&action)), uintptr(unsafe.Pointer(&data)))
	if r != 0 {
		return fmt.Errorf("Windows did not validate the official Node signature (0x%x). Setup stopped without bypassing verification", r)
	}
	c := exec.Command(path, "--version")
	hidden(c)
	b, e := c.Output()
	if e != nil || strings.TrimSpace(string(b)) != "v"+nodeVersion {
		return errors.New("Runtime version validation failed")
	}
	return nil
}
func ensureNode() (string, error) {
	arch := "x64"
	if strings.EqualFold(os.Getenv("PROCESSOR_ARCHITEW6432"), "ARM64") || runtime.GOARCH == "arm64" {
		arch = "arm64"
	}
	name := "node-v" + nodeVersion + "-win-" + arch
	runtimeRoot := filepath.Join(root, "runtimes")
	node := filepath.Join(runtimeRoot, name, "node.exe")
	if _, e := os.Stat(node); e == nil {
		return node, verifyNode(node)
	}
	os.MkdirAll(runtimeRoot, 0700)
	downloadRoot := filepath.Join(root, "downloads")
	os.MkdirAll(downloadRoot, 0700)
	progress("Downloading verified official Node runtime. No AI model is being downloaded.")
	base := "https://nodejs.org/dist/v" + nodeVersion + "/"
	sums := filepath.Join(downloadRoot, "SHASUMS256.txt")
	if e := fetch(base+"SHASUMS256.txt", sums, 1024*1024); e != nil {
		return "", e
	}
	b, e := os.ReadFile(sums)
	if e != nil {
		return "", e
	}
	var expected string
	for _, line := range strings.Split(string(b), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[1] == name+".zip" {
			expected = fields[0]
		}
	}
	if expected == "" {
		return "", errors.New("Official checksum does not list this runtime")
	}
	archive := filepath.Join(downloadRoot, name+".zip")
	if e = fetch(base+name+".zip", archive, 150*1024*1024); e != nil {
		return "", e
	}
	sum, e := fileSHA(archive)
	if e != nil || sum != expected {
		os.Remove(archive)
		return "", errors.New("Official runtime checksum mismatch; affected archive removed and never executed")
	}
	b, e = os.ReadFile(archive)
	if e != nil {
		return "", e
	}
	stage, e := os.MkdirTemp(runtimeRoot, "verified-stage-")
	if e != nil {
		return "", e
	}
	defer os.RemoveAll(stage)
	if e = unzip(b, stage); e != nil {
		return "", e
	}
	if e = verifyNode(filepath.Join(stage, name, "node.exe")); e != nil {
		return "", e
	}
	if e = os.Rename(filepath.Join(stage, name), filepath.Join(runtimeRoot, name)); e != nil {
		return "", e
	}
	return node, nil
}
func installApp(node string) (string, string, error) {
	hash := sha256.Sum256(payload)
	version := hex.EncodeToString(hash[:])[:20]
	app := filepath.Join(root, "versions", version)
	installer := filepath.Join(root, "launchers", version, "AI-Headquarters.exe")
	if _, e := os.Stat(filepath.Join(app, "node_modules", "three", "package.json")); e != nil {
		progress("Installing the bundled application and locked free dependencies. Saved business data stays separate.")
		os.MkdirAll(filepath.Dir(app), 0700)
		stage, e := os.MkdirTemp(filepath.Dir(app), "stage-")
		if e != nil {
			return "", "", e
		}
		defer os.RemoveAll(stage)
		if e = unzip(payload, stage); e != nil {
			return "", "", e
		}
		npm := filepath.Join(filepath.Dir(node), "node_modules", "npm", "bin", "npm-cli.js")
		c := exec.Command(node, npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund")
		hidden(c)
		c.Dir = stage
		c.Env = append(os.Environ(), "npm_config_cache="+filepath.Join(root, "npm-cache"))
		log, e := os.OpenFile(filepath.Join(root, "install.log"), os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
		if e != nil {
			return "", "", e
		}
		c.Stdout = log
		c.Stderr = log
		e = c.Run()
		log.Close()
		if e != nil {
			return "", "", errors.New("Locked dependency installation failed. Open local folder to inspect install.log; integrity verification was not disabled")
		}
		if e = os.Rename(stage, app); e != nil {
			return "", "", e
		}
	}
	if _, e := os.Stat(installer); e != nil {
		self, e := os.Executable()
		if e != nil {
			return "", "", e
		}
		b, e := os.ReadFile(self)
		if e != nil {
			return "", "", e
		}
		os.MkdirAll(filepath.Dir(installer), 0700)
		if e = os.WriteFile(installer, b, 0600); e != nil {
			return "", "", e
		}
	}
	return app, installer, nil
}
func makeShortcut(target string) error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if e := ole.CoInitialize(0); e != nil {
		return e
	}
	defer ole.CoUninitialize()
	object, e := oleutil.CreateObject("WScript.Shell")
	if e != nil {
		return e
	}
	defer object.Release()
	shell, e := object.QueryInterface(ole.IID_IDispatch)
	if e != nil {
		return e
	}
	defer shell.Release()
	folders, e := oleutil.GetProperty(shell, "SpecialFolders")
	if e != nil {
		return e
	}
	folderObject := folders.ToIDispatch()
	defer folderObject.Release()
	desktopFolder, e := oleutil.CallMethod(folderObject, "Item", "Desktop")
	if e != nil {
		return e
	}
	desktop := filepath.Join(desktopFolder.ToString(), "AI Headquarters.lnk")
	v, e := oleutil.CallMethod(shell, "CreateShortcut", desktop)
	if e != nil {
		return e
	}
	link := v.ToIDispatch()
	defer link.Release()
	if _, e = oleutil.PutProperty(link, "TargetPath", target); e != nil {
		return e
	}
	oleutil.PutProperty(link, "WorkingDirectory", root)
	oleutil.PutProperty(link, "Description", "Open your private local AI Headquarters")
	_, e = oleutil.CallMethod(link, "Save")
	return e
}
func startOffice(wantShortcut bool) error {
	if e := protectFolder(); e != nil {
		return e
	}
	s := readState()
	if st, e := getStatus(); e == nil {
		progress("Opening the existing local office. No account or data was replaced.")
		return openOffice(s, st)
	}
	if connection, e := net.DialTimeout("tcp", "127.0.0.1:4310", time.Second); e == nil {
		connection.Close()
		return errors.New("Port 4310 is occupied. No application was stopped or replaced. If this is your older office, stop it with its original launcher first")
	}
	if owned(s) {
		return errors.New("The owned office process exists but is not ready. Use Stop office before starting another copy")
	}
	node, e := ensureNode()
	if e != nil {
		return e
	}
	app, self, e := installApp(node)
	if e != nil {
		return e
	}
	codeBytes := make([]byte, 24)
	if _, e = rand.Read(codeBytes); e != nil {
		return e
	}
	code := hex.EncodeToString(codeBytes)
	encrypted, e := seal(code)
	if e != nil {
		return e
	}
	c := exec.Command(node, filepath.Join(app, "src", "server.ts"))
	hidden(c)
	c.Dir = app
	environment := []string{}
	for _, value := range os.Environ() {
		key := strings.ToUpper(strings.SplitN(value, "=", 2)[0])
		if key != "HOST" && key != "PORT" && key != "HQ_DATA_DIR" && key != "HQ_SETUP_CODE" && key != "RENDER" && key != "PUBLIC_ORIGIN" && key != "RENDER_EXTERNAL_URL" && key != "NODE_OPTIONS" && key != "SAM_API_KEY" && key != "HQ_INSTALLER_PATH" {
			environment = append(environment, value)
		}
	}
	environment = append(environment, "HOST=127.0.0.1", "PORT=4310", "HQ_DATA_DIR="+filepath.Join(root, "data"), "HQ_SETUP_CODE="+code, "HQ_INSTALLER_PATH="+self)
	if protected, e := os.ReadFile(filepath.Join(root, "sam-native.dpapi")); e == nil {
		key, e := unseal(string(protected))
		if e != nil {
			return errors.New("Windows could not unlock the optional saved SAM key")
		}
		environment = append(environment, "SAM_API_KEY="+key)
	} else if key := os.Getenv("SAM_API_KEY"); key != "" {
		environment = append(environment, "SAM_API_KEY="+key)
	}
	c.Env = environment
	log, e := os.OpenFile(filepath.Join(root, "server-native.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if e != nil {
		return e
	}
	c.Stdout = log
	c.Stderr = log
	progress("Starting your local office. Closing the browser will not erase work.")
	if e = c.Start(); e != nil {
		log.Close()
		return e
	}
	log.Close()
	exe, created, e := processIdentity(c.Process.Pid)
	if e != nil {
		return e
	}
	s = state{PID: c.Process.Pid, Executable: exe, App: app, Created: created, Setup: encrypted}
	if e = saveState(s); e != nil {
		return e
	}
	c.Process.Release()
	for i := 0; i < 40; i++ {
		if st, e := getStatus(); e == nil {
			if wantShortcut {
				if e = makeShortcut(self); e != nil {
					info("The office installed, but Windows could not create the optional desktop shortcut. Your downloaded app still opens it.")
				}
			}
			progress("Office installed and running locally. No Render required. Clock out to pause or Stop office here.")
			return openOffice(s, st)
		}
		time.Sleep(500 * time.Millisecond)
	}
	return errors.New("Office is not ready yet. Do not start another copy; inspect server-native.log in the private local folder")
}
func stopOffice() error {
	s := readState()
	if !owned(s) {
		return errors.New("No running office owned by this native launcher was found. No other process was stopped")
	}
	p, e := os.FindProcess(s.PID)
	if e != nil {
		return e
	}
	if e = p.Kill(); e != nil {
		return e
	}
	progress("Local office stopped. Founder login, research and notes were kept.")
	return nil
}
func importBackup(source string) error {
	if e := protectFolder(); e != nil {
		return e
	}
	if owned(readState()) {
		return errors.New("Stop the local office before importing a backup. No running office was interrupted")
	}
	if connection, e := net.DialTimeout("tcp", "127.0.0.1:4310", time.Second); e == nil {
		connection.Close()
		return errors.New("An office or another application is listening on port 4310. Stop the office with its original launcher before importing")
	}
	database := filepath.Join(root, "data", "headquarters.sqlite")
	absolute, e := filepath.Abs(source)
	if e != nil {
		return e
	}
	if strings.EqualFold(absolute, database) {
		return errors.New("Choose the exported backup, not the installed database")
	}
	node, e := ensureNode()
	if e != nil {
		return e
	}
	stage, e := os.MkdirTemp(root, "restore-stage-")
	if e != nil {
		return e
	}
	defer os.RemoveAll(stage)
	helper := filepath.Join(stage, "database-restore.mjs")
	if e = os.WriteFile(helper, databaseHelper, 0600); e != nil {
		return e
	}
	copyDB := func(from, to string) error {
		c := exec.Command(node, helper, "copy", from, to)
		hidden(c)
		if e := c.Run(); e != nil {
			return errors.New("Database integrity/schema validation or consistent backup failed. Choose a trusted complete AI Headquarters SQLite backup. Source contents were not displayed")
		}
		return nil
	}
	prepared := filepath.Join(stage, "headquarters.sqlite")
	progress("Validating your backup without changing the local office.")
	if e = copyDB(absolute, prepared); e != nil {
		return e
	}
	recovery := filepath.Join(root, "recovery", time.Now().Format("20060102-150405.000000000"))
	if e = os.MkdirAll(recovery, 0700); e != nil {
		return e
	}
	if _, e = os.Stat(database); e == nil {
		progress("Creating a verified recovery copy of the existing local office.")
		if e = copyDB(database, filepath.Join(recovery, "verified-before-import.sqlite")); e != nil {
			return e
		}
	} else if !os.IsNotExist(e) {
		return e
	}
	moved := []string{}
	rollback := func(cause error) error {
		for i := len(moved) - 1; i >= 0; i-- {
			suffix := moved[i]
			if e := os.Rename(filepath.Join(recovery, "original-headquarters.sqlite"+suffix), database+suffix); e != nil {
				return fmt.Errorf("Import stopped; automatic recovery needs review. Do not start the office. Previous files are kept privately at %s", recovery)
			}
		}
		return fmt.Errorf("Import stopped and original database files were restored: %w", cause)
	}
	for _, suffix := range []string{"", "-wal", "-shm", "-journal"} {
		if _, e = os.Stat(database + suffix); os.IsNotExist(e) {
			continue
		} else if e != nil {
			return rollback(e)
		}
		if e = os.Rename(database+suffix, filepath.Join(recovery, "original-headquarters.sqlite"+suffix)); e != nil {
			return rollback(e)
		}
		moved = append(moved, suffix)
	}
	if e = os.Rename(prepared, database); e != nil {
		return rollback(e)
	}
	progress("Backup imported. Open office and use the founder password from that backup. Previous local files were retained privately.")
	return nil
}
func main() {
	mutex, e := windows.CreateMutex(nil, true, utf("Local\\LeaXAIHeadquartersNativeSetup"))
	if e == windows.ERROR_ALREADY_EXISTS {
		walk.MsgBox(nil, "AI Headquarters", "A setup window is already open. Use that window to avoid overlapping installation or database changes.", walk.MsgBoxIconInformation)
		return
	}
	if e != nil {
		return
	}
	defer windows.CloseHandle(mutex)

	root = filepath.Join(os.Getenv("LOCALAPPDATA"), "AIHeadquarters")
	if root == "AIHeadquarters" {
		return
	}
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	err := (MainWindow{AssignTo: &window, Title: "AI Headquarters — local app setup", MinSize: Size{Width: 760, Height: 720}, Layout: VBox{Margins: Margins{Left: 24, Top: 20, Right: 24, Bottom: 20}}, Children: []Widget{
		Label{Text: "Your company. Your computer.", Font: Font{Family: "Segoe UI", PointSize: 19, Bold: true}},
		Label{Text: "This native Windows setup does not run a PowerShell script or open a terminal.\nBusiness records stay privately in your Windows user folder, outside application updates.\nInternet is used for official runtime/dependency downloads and authorized research. No paid services or AI models install automatically."},
		Label{Text: "Private data folder: " + filepath.Join(root, "data")},
		CheckBox{AssignTo: &shortcut, Text: "Create a desktop shortcut", Checked: true},
		Composite{Layout: HBox{}, Children: []Widget{PushButton{AssignTo: &startButton, Text: "Install / open office", OnClicked: func() { wanted := shortcut.Checked(); runOperation(func() error { return startOffice(wanted) }) }}, PushButton{AssignTo: &stopButton, Text: "Stop local office", OnClicked: func() {
			if walk.MsgBox(window, "Stop local office?", "Saved data is retained. Active research/model requests stop and can recover after restart.", walk.MsgBoxYesNo|walk.MsgBoxIconQuestion) == walk.DlgCmdYes {
				runOperation(stopOffice)
			}
		}}, PushButton{Text: "Open private local folder", OnClicked: func() { os.MkdirAll(root, 0700); openItem(root) }}}},
		PushButton{Text: "Import saved office from Render / backup", OnClicked: func() {
			if busy.Load() {
				return
			}
			dialog := new(walk.FileDialog)
			dialog.Title = "Choose your trusted AI Headquarters backup"
			dialog.Filter = "AI Headquarters backup (*.sqlite)|*.sqlite"
			ok, e := dialog.ShowOpen(window)
			if e != nil || !ok {
				return
			}
			source := dialog.FilePath
			if walk.MsgBox(window, "Import this saved office?", "The selected backup’s founder login and records will replace this local office. A verified recovery backup and original local files will be kept first. Stop the office before importing. Your selected backup remains unchanged. Continue?", walk.MsgBoxYesNo|walk.MsgBoxIconWarning) == walk.DlgCmdYes {
				runOperation(func() error { return importBackup(source) })
			}
		}},
		GroupBox{Title: "Optional free SAM.gov current-bid access", Layout: VBox{}, Children: []Widget{Label{Text: "Historical awards need no key. Current federal bid search requires your own free SAM.gov API key.\nThis field is optional, masked, and saved using Windows-user encryption. Never share the key in chat."}, LineEdit{AssignTo: &keyInput, PasswordMode: true}, Composite{Layout: HBox{}, Children: []Widget{PushButton{Text: "Save private SAM key", OnClicked: func() {
			key := strings.TrimSpace(keyInput.Text())
			if key == "" {
				walk.MsgBox(window, "No key entered", "Paste your own SAM.gov API key if you want current federal bid research.", walk.MsgBoxIconInformation)
				return
			}
			keyInput.SetText("")
			runOperation(func() error {
				if e := protectFolder(); e != nil {
					return e
				}
				encrypted, e := seal(key)
				if e != nil {
					return e
				}
				if e = writePrivate(filepath.Join(root, "sam-native.dpapi"), []byte(encrypted)); e != nil {
					return e
				}
				info("Key saved privately. If the local office is already running, Stop then Open it to apply this key. No account was created and no bid was submitted.")
				return nil
			})
		}}, PushButton{Text: "Official free account / key instructions", OnClicked: func() { openItem("https://open.gsa.gov/api/get-opportunities-public-api/") }}}}}},
		Label{AssignTo: &statusLabel, Text: "Ready. First setup needs internet. This computer must remain awake for background work.\nA verified publisher certificate is not included; this app is unsigned. Only run the download from your own repository or authenticated owner workspace."},
	}}).Create()
	if err != nil {
		syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(utf("The setup window could not open: "+err.Error()))), uintptr(unsafe.Pointer(utf("AI Headquarters"))), 0x10)
		return
	}
	window.Closing().Attach(func(cancel *bool, reason walk.CloseReason) {
		if busy.Load() {
			*cancel = true
			walk.MsgBox(window, "Setup in progress", "Wait for the operation to finish before closing setup.", walk.MsgBoxIconInformation)
		}
	})
	window.Run()
}
