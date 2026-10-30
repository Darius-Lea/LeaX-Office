//go:build windows

package main

import (
	"context"
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
var startButton, stopButton, cancelButton *walk.PushButton
var progressBar *walk.ProgressBar
var operationContext = context.Background()
var cancelOperation context.CancelFunc
var closeAfterCancel bool
var operationStartedAI, operationStartedOffice bool
var shortcut *walk.CheckBox
var samOptions *walk.GroupBox
var busy atomic.Bool
var client = &http.Client{Timeout: 3 * time.Minute}

type state struct {
	PID                             int
	Executable, App, Created, Setup string
}
type localStatus struct {
	Product       string `json:"product"`
	SetupRequired bool   `json:"setupRequired"`
	AIReady       bool   `json:"aiReady"`
	AIModel       string `json:"aiModel"`
}

func utf(s string) *uint16 { return syscall.StringToUTF16Ptr(s) }
func hidden(c *exec.Cmd) {
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}
func progress(s string) { window.Synchronize(func() { statusLabel.SetText(s) }) }
func info(s string) {
	window.Synchronize(func() { walk.MsgBox(window, "AI Headquarters", s, walk.MsgBoxIconInformation) })
}
func pauseSetup(duration time.Duration) error {
	select {
	case <-operationContext.Done():
		return operationContext.Err()
	case <-time.After(duration):
		return nil
	}
}
func stopSetup() {
	if cancelOperation != nil {
		cancelOperation()
		cancelButton.SetEnabled(false)
		statusLabel.SetText("Stopping setup safely. Your saved office and completed downloads are kept.")
	}
}
func runOperation(f func() error) {
	if !busy.CompareAndSwap(false, true) {
		return
	}
	operationContext, cancelOperation = context.WithCancel(context.Background())
	operationStartedAI = false
	operationStartedOffice = false
	cancelButton.SetEnabled(true)
	progressBar.SetMarqueeMode(true)
	startButton.SetEnabled(false)
	stopButton.SetEnabled(false)
	if keyInput != nil {
		keyInput.SetEnabled(false)
	}
	go func() {
		err := f()
		cancelled := operationContext.Err() != nil
		if cancelled {
			if operationStartedOffice {
				if s := readState(); owned(s) {
					if p, e := os.FindProcess(s.PID); e == nil {
						p.Kill()
					}
				}
			}
			if operationStartedAI {
				stopManagedAI()
			}
		}
		cancelOperation()
		window.Synchronize(func() {
			busy.Store(false)
			cancelButton.SetEnabled(false)
			progressBar.SetMarqueeMode(false)
			if cancelled {
				statusLabel.SetText("Setup paused safely. Choose Install / open office to continue. Your business data was kept.")
				if closeAfterCancel {
					window.Close()
					return
				}
			}
			startButton.SetEnabled(true)
			stopButton.SetEnabled(true)
			if keyInput != nil {
				keyInput.SetEnabled(true)
			}
			if err != nil && !cancelled {
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
	cmd := exec.CommandContext(operationContext, filepath.Join(os.Getenv("SystemRoot"), "System32", "icacls.exe"), root, "/inheritance:r", "/grant:r", "*"+user.User.Sid.String()+":(OI)(CI)F", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F")
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
func browserBridgeToken() (string, error) {
	path := filepath.Join(root, "browser-bridge.dpapi")
	if protected, err := os.ReadFile(path); err == nil {
		token, err := unseal(strings.TrimSpace(string(protected)))
		if err != nil || len(token) != 64 {
			return "", errors.New("The private LeaX browser bridge key could not be unlocked")
		}
		return token, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	token := hex.EncodeToString(bytes)
	protected, err := seal(token)
	if err != nil {
		return "", err
	}
	if err = os.WriteFile(path, []byte(protected), 0600); err != nil {
		return "", err
	}
	return token, nil
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
	return openOfficeBrowser(url)
}
func fetch(url, path string, max int64) error {
	request, e := http.NewRequestWithContext(operationContext, "GET", url, nil)
	if e != nil {
		return e
	}
	r, e := client.Do(request)
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

func verifySignedExecutable(path string) error {
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
		return fmt.Errorf("Windows did not validate the executable signature (0x%x). Verification was not bypassed", r)
	}
	return nil
}
func verifyNode(path string) error {
	if e := verifySignedExecutable(path); e != nil {
		return fmt.Errorf("Official runtime signature check failed: %w", e)
	}
	c := exec.CommandContext(operationContext, path, "--version")
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
		if e = verifyNode(node); e == nil {
			return node, nil
		}
		if e = operationContext.Err(); e != nil {
			return "", e
		}
		progress("Repairing the saved Node runtime using a fresh official, verified download. Your business data is kept.")
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
	if e = extractSetupArchive(operationContext, b, stage, false); e != nil {
		return "", e
	}
	if e = verifyNode(filepath.Join(stage, name, "node.exe")); e != nil {
		return "", e
	}
	if e = installPreparedDirectory(operationContext, filepath.Join(stage, name), filepath.Join(runtimeRoot, name)); e != nil {
		return "", e
	}
	return node, nil
}
func installLauncher() (string, error) {
	self, e := os.Executable()
	if e != nil {
		return "", e
	}
	sum, e := fileSHA(self)
	if e != nil {
		return "", e
	}
	installer := filepath.Join(root, "launchers", sum[:20], "AI-Headquarters.exe")
	if strings.EqualFold(self, installer) {
		return installer, nil
	}
	if existing, e := fileSHA(installer); e == nil && existing == sum {
		return installer, nil
	}
	b, e := os.ReadFile(self)
	if e != nil {
		return "", e
	}
	if e = os.MkdirAll(filepath.Dir(installer), 0700); e != nil {
		return "", e
	}
	if e = os.WriteFile(installer, b, 0600); e != nil {
		return "", e
	}
	return installer, nil
}
func installApp(_ string) (string, string, error) {
	hash := sha256.Sum256(payload)
	version := hex.EncodeToString(hash[:])[:20]
	app := filepath.Join(root, "versions", version)
	if e := verifyApplication(operationContext, app); e != nil {
		progress("Installing your complete application. No development tools or dependency setup are needed.")
		if e = os.MkdirAll(filepath.Dir(app), 0700); e != nil {
			return "", "", e
		}
		stage, e := os.MkdirTemp(filepath.Dir(app), "stage-")
		if e != nil {
			return "", "", e
		}
		defer os.RemoveAll(stage)
		if e = extractSetupArchive(operationContext, payload, stage, true); e != nil {
			return "", "", e
		}
		if e = verifyApplication(operationContext, stage); e != nil {
			return "", "", e
		}
		if _, e = os.Stat(app); e == nil {
			if e = os.Rename(app, app+"-incomplete-"+time.Now().Format("20060102-150405.000000000")); e != nil {
				return "", "", e
			}
		}
		if e = os.Rename(stage, app); e != nil {
			return "", "", e
		}
	}
	launcher, e := installLauncher()
	if e != nil {
		return "", "", e
	}
	return app, launcher, nil
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
	existing, existingError := getStatus()
	runningOwned := existingError == nil && owned(s)
	hash := sha256.Sum256(payload)
	expectedApp := filepath.Join(root, "versions", hex.EncodeToString(hash[:])[:20])
	if existingError == nil {
		if !runningOwned {
			progress("Opening the existing local office. No account or data was replaced.")
			return openOffice(s, existing)
		}
		if strings.EqualFold(s.App, expectedApp) && existing.AIReady && owned(aiState()) {
			if models, e := aiGetTags(); e == nil && verifiedModelAvailable(existing.AIReady, existing.AIModel, models) {
				if wantShortcut {
					if launcher, e := installLauncher(); e == nil {
						makeShortcut(launcher)
					}
				}
				progress("Your saved office and built-in AI are already running. Opening your computer.")
				return openOffice(s, existing)
			}
		}
	}
	if !runningOwned {
		if connection, e := net.DialTimeout("tcp", "127.0.0.1:4310", time.Second); e == nil {
			connection.Close()
			return errors.New("Port 4310 is occupied by another app. It was not stopped. If this is an older office, close it with its original launcher")
		}
		if owned(s) {
			return errors.New("Your local office is still starting. Wait a moment and choose Install / open office again")
		}
	}
	node, e := ensureNode()
	if e != nil {
		return e
	}
	app, self, e := installApp(node)
	if e != nil {
		return e
	}
	// Prepare the small verified app/runtime before replacing a healthy owned office.
	if runningOwned {
		p, e := os.FindProcess(s.PID)
		if e != nil {
			return e
		}
		if e = p.Kill(); e != nil {
			return e
		}
		for i := 0; i < 30; i++ {
			if c, e := net.DialTimeout("tcp", "127.0.0.1:4310", 100*time.Millisecond); e == nil {
				c.Close()
				if e = pauseSetup(100 * time.Millisecond); e != nil {
					return e
				}
			} else {
				break
			}
		}
	}
	if e = operationContext.Err(); e != nil {
		return e
	}
	codeBytes := make([]byte, 24)
	if _, e = rand.Read(codeBytes); e != nil {
		return e
	}
	code := hex.EncodeToString(codeBytes)
	bridgeToken, e := browserBridgeToken()
	if e != nil {
		return fmt.Errorf("Could not protect the local browser bridge: %w", e)
	}
	encrypted, e := seal(code)
	if e != nil {
		return e
	}
	c := exec.Command(node, filepath.Join(app, "runtime", "server.mjs"))
	hidden(c)
	c.Dir = app
	environment := []string{}
	for _, value := range os.Environ() {
		key := strings.ToUpper(strings.SplitN(value, "=", 2)[0])
		if key != "HOST" && key != "PORT" && key != "HQ_DATA_DIR" && key != "HQ_SETUP_CODE" && key != "RENDER" && key != "PUBLIC_ORIGIN" && key != "RENDER_EXTERNAL_URL" && key != "NODE_OPTIONS" && key != "SAM_API_KEY" && key != "HQ_INSTALLER_PATH" && key != "HQ_OLLAMA_PORT" && key != "HQ_BROWSER_BRIDGE_TOKEN" {
			environment = append(environment, value)
		}
	}
	environment = append(environment, "HOST=127.0.0.1", "PORT=4310", "HQ_DATA_DIR="+filepath.Join(root, "data"), "HQ_SETUP_CODE="+code, "HQ_INSTALLER_PATH="+self, "HQ_OLLAMA_PORT="+managedAIPort, "HQ_BROWSER_BRIDGE_TOKEN="+bridgeToken)
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
		c.Process.Kill()
		return e
	}
	s = state{PID: c.Process.Pid, Executable: exe, App: app, Created: created, Setup: encrypted}
	if e = saveState(s); e != nil {
		c.Process.Kill()
		return e
	}
	operationStartedOffice = true
	c.Process.Release()
	for i := 0; i < 40; i++ {
		if st, e := getStatus(); e == nil {
			if wantShortcut {
				if e = makeShortcut(self); e != nil {
					info("The office installed, but Windows could not create the optional desktop shortcut. Your downloaded app still opens it.")
				}
			}
			progress("Your office is installed. Opening it now while automatic local AI setup continues here.")
			if e = finishOfficeSetup(operationContext, func() error {
				if e := openOffice(s, st); e != nil {
					return e
				}
				// Cancelling remaining AI preparation leaves the handed-off office running.
				operationStartedOffice = false
				return nil
			}, prepareBuiltInAI, func(model string) error { return verifyAIConfiguration(node, app, model) }, func(status string) error { return markAISetup(node, app, status) }); e != nil {
				return fmt.Errorf("Your local office is installed and its saved work is kept. Built-in AI setup needs attention: %w. Choose Install / open office here to retry automatic AI setup", e)
			}
			progress("Office and built-in AI are ready locally. No Render required. Clock out to pause work or Stop local office here.")
			return nil
		}
		if e = pauseSetup(500 * time.Millisecond); e != nil {
			return e
		}
	}
	return errors.New("Office is not ready yet. Do not start another copy; inspect server-native.log in the private local folder")
}
func stopOffice() error {
	s := readState()
	if !owned(s) {
		if e := stopManagedAI(); e != nil {
			return e
		}
		progress("Owned AI engine stopped; saved data was kept. No unknown process was stopped.")
		return nil
	}
	p, e := os.FindProcess(s.PID)
	if e != nil {
		return e
	}
	if e = p.Kill(); e != nil {
		return e
	}
	if e = stopManagedAI(); e != nil {
		return e
	}
	progress("Local office and its owned AI engine stopped. Founder login, research and notes were kept.")
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
		c := exec.CommandContext(operationContext, node, helper, "copy", from, to)
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
	if e = operationContext.Err(); e != nil {
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
	if handleLeaXBrowserCommand() {
		return
	}
	if handleCredentialCommand() {
		return
	}
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
	err := (MainWindow{AssignTo: &window, Title: "AI Headquarters — local app setup", MinSize: Size{Width: 720, Height: 470}, Layout: VBox{Margins: Margins{Left: 24, Top: 20, Right: 24, Bottom: 20}}, Children: []Widget{
		Label{Text: "Your company. Your computer.", Font: Font{Family: "Segoe UI", PointSize: 19, Bold: true}},
		Label{Text: "We set up your private business office and free local AI automatically.\nFirst setup needs internet and downloads about 2–5 GB. Your work stays saved between app updates.\nNo terminal, separate AI installation or paid AI account is needed."},
		Label{Text: "Your business records stay in your private Windows account."},
		CheckBox{AssignTo: &shortcut, Text: "Create a desktop shortcut", Checked: true},
		Composite{Layout: HBox{}, Children: []Widget{PushButton{AssignTo: &startButton, Text: "Install / open office", OnClicked: func() { wanted := shortcut.Checked(); runOperation(func() error { return startOffice(wanted) }) }}, PushButton{AssignTo: &cancelButton, Text: "Cancel setup", Enabled: false, OnClicked: stopSetup}, PushButton{AssignTo: &stopButton, Text: "Stop local office", OnClicked: func() {
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
		PushButton{Text: "Optional: add federal bid access", OnClicked: func() {
			samOptions.SetVisible(!samOptions.Visible())
			if samOptions.Visible() {
				window.SetSize(walk.Size{Width: 760, Height: 740})
			}
		}},
		GroupBox{AssignTo: &samOptions, Visible: false, Title: "Optional free SAM.gov current-bid access", Layout: VBox{}, Children: []Widget{Label{Text: "Historical awards need no key. Current federal bid search requires your own free SAM.gov API key.\nThis field is optional, masked, and saved using Windows-user encryption. Never share the key in chat."}, LineEdit{AssignTo: &keyInput, PasswordMode: true}, Composite{Layout: HBox{}, Children: []Widget{PushButton{Text: "Save private SAM key", OnClicked: func() {
			if busy.Load() {
				return
			}
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
		ProgressBar{AssignTo: &progressBar},
		Label{AssignTo: &statusLabel, Text: "Starting automatic setup… You can cancel safely and continue later.\nKeep this computer awake for background work. This download is currently unsigned."},
	}}).Create()
	if err != nil {
		syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(utf("The setup window could not open: "+err.Error()))), uintptr(unsafe.Pointer(utf("AI Headquarters"))), 0x10)
		return
	}
	window.Closing().Attach(func(cancel *bool, reason walk.CloseReason) {
		if busy.Load() {
			*cancel = true
			closeAfterCancel = true
			stopSetup()
		}
	})
	window.Starting().Attach(func() { runOperation(func() error { return startOffice(shortcut.Checked()) }) })
	window.Run()
}
