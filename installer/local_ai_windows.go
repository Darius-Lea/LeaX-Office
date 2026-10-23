//go:build windows

package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

// This engine runs privately and does not register a Windows service.
var aiHTTP = &http.Client{Timeout: 10 * time.Minute, Transport: &http.Transport{Proxy: nil}}

const aiURL = "http://127.0.0.1:" + managedAIPort

type memoryStatus struct {
	Length, Load                                                                          uint32
	TotalPhys, AvailPhys, TotalPage, AvailPage, TotalVirtual, AvailVirtual, AvailExtended uint64
}

func deviceMemory() (uint64, error) {
	s := memoryStatus{}
	s.Length = uint32(unsafe.Sizeof(s))
	ok, _, e := syscall.NewLazyDLL("kernel32.dll").NewProc("GlobalMemoryStatusEx").Call(uintptr(unsafe.Pointer(&s)))
	if ok == 0 {
		return 0, e
	}
	return s.TotalPhys, nil
}
func checkAISpace() error {
	var available uint64
	ok, _, e := syscall.NewLazyDLL("kernel32.dll").NewProc("GetDiskFreeSpaceExW").Call(uintptr(unsafe.Pointer(utf(root))), uintptr(unsafe.Pointer(&available)), 0, 0)
	if ok == 0 {
		return e
	}
	if available < 12*1024*1024*1024 {
		return errors.New("At least 12 GB free disk space is needed for first-time AI setup, extraction and a starter model. Your business data was kept; free space and reopen setup")
	}
	return nil
}
func aiStatePath() string { return filepath.Join(root, "ai-process.json") }
func aiState() state {
	var s state
	b, e := os.ReadFile(aiStatePath())
	if e == nil {
		json.Unmarshal(b, &s)
	}
	return s
}
func saveAIState(s state) error {
	b, e := json.Marshal(s)
	if e != nil {
		return e
	}
	return writePrivate(aiStatePath(), b)
}
func stopManagedAI() error {
	s := aiState()
	if !owned(s) {
		return nil
	}
	p, e := os.FindProcess(s.PID)
	if e != nil {
		return e
	}
	return p.Kill()
}
func aiGetTags() ([]string, error) {
	c := http.Client{Timeout: 2 * time.Second, Transport: &http.Transport{Proxy: nil}}
	r, e := c.Get(aiURL + "/api/tags")
	if e != nil {
		return nil, e
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return nil, errors.New("Managed AI did not return a model list")
	}
	var data struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if e = json.NewDecoder(io.LimitReader(r.Body, 500000)).Decode(&data); e != nil {
		return nil, e
	}
	models := []string{}
	for _, m := range data.Models {
		models = append(models, m.Name)
	}
	return models, nil
}
func ensureAIRuntime() (string, error) {
	directory := filepath.Join(root, "ai", "ollama-"+ollamaVersion)
	binary := filepath.Join(directory, "ollama.exe")
	manifestPath := filepath.Join(directory, "hq-integrity.json")
	verifySaved := func() error {
		data, e := os.ReadFile(manifestPath)
		if e != nil {
			return e
		}
		var manifest map[string]string
		if e = json.Unmarshal(data, &manifest); e != nil {
			return errors.New("Saved AI runtime verification is invalid; no runtime was launched")
		}
		if len(manifest) == 0 || len(manifest) > 5000 || manifest["ollama.exe"] == "" {
			return errors.New("Incomplete AI runtime verification")
		}
		progress("Checking saved local AI runtime. No model re-download is needed.")
		for name, sum := range manifest {
			p := filepath.Join(directory, filepath.FromSlash(name))
			rel, e := filepath.Rel(directory, p)
			if e != nil || strings.HasPrefix(rel, "..") || strings.Contains(name, ":") {
				return errors.New("Invalid AI runtime manifest path")
			}
			if e = checkHashContext(operationContext, p, sum); e != nil {
				return e
			}
		}
		return nil
	}
	if e := verifySaved(); e == nil {
		return binary, nil
	} else if e = operationContext.Err(); e != nil {
		return "", e
	}
	if _, e := os.Stat(directory); e == nil {
		progress("Repairing the saved AI runtime with a verified official download. Your saved models and business records are kept.")
	}
	if e := checkAISpace(); e != nil {
		return "", e
	}
	downloads := filepath.Join(root, "downloads")
	os.MkdirAll(downloads, 0700)
	archive := filepath.Join(downloads, "ollama-"+ollamaVersion+"-windows-amd64.zip")
	if e := checkHashContext(operationContext, archive, ollamaArchiveSHA); e != nil {
		progress("Downloading the built-in local AI engine (about 1.5 GB). You do not need to install or connect another app.")
		if e = downloadAI(archive); e != nil {
			return "", e
		}
		progress("Verifying the official AI engine download before running it.")
		if e = checkHashContext(operationContext, archive, ollamaArchiveSHA); e != nil {
			os.Remove(archive)
			return "", e
		}
	}
	os.MkdirAll(filepath.Dir(directory), 0700)
	stage, e := os.MkdirTemp(filepath.Dir(directory), "verified-ai-")
	if e != nil {
		return "", e
	}
	defer os.RemoveAll(stage)
	progress("Preparing the verified local AI engine. Your business files remain separate.")
	if e = extractAIArchiveContext(operationContext, archive, stage); e != nil {
		return "", e
	}
	if _, e = os.Stat(filepath.Join(stage, "ollama.exe")); e != nil {
		return "", errors.New("Official runtime archive does not contain the expected executable")
	}
	manifest := map[string]string{}
	e = filepath.WalkDir(stage, func(p string, entry os.DirEntry, e error) error {
		if e != nil {
			return e
		}
		if entry.IsDir() {
			return nil
		}
		name, e := filepath.Rel(stage, p)
		if e != nil {
			return e
		}
		sum, e := hashFileContext(operationContext, p)
		if e != nil {
			return e
		}
		manifest[filepath.ToSlash(name)] = sum
		return nil
	})
	if e != nil {
		return "", e
	}
	data, e := json.Marshal(manifest)
	if e != nil {
		return "", e
	}
	if e = os.WriteFile(filepath.Join(stage, "hq-integrity.json"), data, 0600); e != nil {
		return "", e
	}
	if e = installPreparedDirectory(operationContext, stage, directory); e != nil {
		return "", e
	}
	os.Remove(archive)
	return binary, nil
}

type downloadProgress struct {
	last        time.Time
	done, total int64
}

func (p *downloadProgress) Write(b []byte) (int, error) {
	p.done += int64(len(b))
	if time.Since(p.last) > time.Second {
		p.last = time.Now()
		if p.total > 0 {
			progress(fmt.Sprintf("Installing built-in AI: %.0f MB of %.0f MB. This is automatic; you can safely cancel and retry.", float64(p.done)/1048576, float64(p.total)/1048576))
		} else {
			progress(fmt.Sprintf("Installing built-in AI: %.0f MB downloaded. This is automatic; you can safely cancel and retry.", float64(p.done)/1048576))
		}
	}
	return len(b), nil
}
func downloadAI(path string) error {
	ctx, cancel := context.WithTimeout(operationContext, 2*time.Hour)
	defer cancel()
	request, e := http.NewRequestWithContext(ctx, "GET", ollamaArchiveURL, nil)
	if e != nil {
		return e
	}
	c := http.Client{Timeout: 2 * time.Hour}
	r, e := c.Do(request)
	if e != nil {
		return errors.New("AI download could not be reached. Check internet access and reopen setup; verification was not bypassed")
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return fmt.Errorf("Official AI download returned HTTP %d", r.StatusCode)
	}
	if r.ContentLength > 3*1024*1024*1024 {
		return errors.New("AI download exceeds its size limit")
	}
	f, e := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if e != nil {
		return e
	}
	n, copyErr := io.Copy(io.MultiWriter(f, &downloadProgress{total: r.ContentLength}), io.LimitReader(r.Body, 3*1024*1024*1024+1))
	closeErr := f.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	if n > 3*1024*1024*1024 {
		return errors.New("AI download exceeds its size limit")
	}
	return nil
}
func ensureAIProcess() error {
	s := aiState()
	if owned(s) {
		for i := 0; i < 30; i++ {
			if _, e := aiGetTags(); e == nil {
				return nil
			}
			if e := pauseSetup(time.Second); e != nil {
				return e
			}
		}
		progress("Repairing the app’s unresponsive AI process. Other applications are left alone.")
		if e := stopManagedAI(); e != nil {
			return e
		}
		for i := 0; i < 30; i++ {
			if c, e := net.DialTimeout("tcp", "127.0.0.1:"+managedAIPort, 100*time.Millisecond); e == nil {
				c.Close()
				if e := pauseSetup(100 * time.Millisecond); e != nil {
					return e
				}
			} else {
				break
			}
		}
	}
	if c, e := net.DialTimeout("tcp", "127.0.0.1:"+managedAIPort, time.Second); e == nil {
		c.Close()
		return errors.New("The app’s private AI port is occupied by an unrecognized process. No other app was stopped")
	}
	binary, e := ensureAIRuntime()
	if e != nil {
		return e
	}
	c := exec.Command(binary, "serve")
	hidden(c)
	c.Dir = filepath.Dir(binary)
	environment := []string{}
	for _, v := range os.Environ() {
		if !strings.HasPrefix(strings.ToUpper(strings.SplitN(v, "=", 2)[0]), "OLLAMA_") {
			environment = append(environment, v)
		}
	}
	c.Env = append(environment, "OLLAMA_HOST=127.0.0.1:"+managedAIPort, "OLLAMA_MODELS="+filepath.Join(root, "ai", "models"), "OLLAMA_NO_CLOUD=1", "OLLAMA_NUM_PARALLEL=1", "OLLAMA_MAX_LOADED_MODELS=1", "OLLAMA_KEEP_ALIVE=2m")
	log, e := os.OpenFile(filepath.Join(root, "ai-runtime.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if e != nil {
		return e
	}
	c.Stdout = log
	c.Stderr = log
	progress("Starting the built-in AI engine privately on this computer.")
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
	if e = saveAIState(state{PID: c.Process.Pid, Executable: exe, Created: created}); e != nil {
		c.Process.Kill()
		return e
	}
	operationStartedAI = true
	c.Process.Release()
	for i := 0; i < 60; i++ {
		if _, e = aiGetTags(); e == nil {
			return nil
		}
		if e := pauseSetup(time.Second); e != nil {
			return e
		}
	}
	return errors.New("Local AI engine did not become ready. Research records were retained; setup can be reopened to retry")
}
func pullAIModel(model string) error {
	models, e := aiGetTags()
	if e != nil {
		return e
	}
	for _, name := range models {
		if name == model {
			return nil
		}
	}
	data, _ := json.Marshal(map[string]any{"model": model, "stream": true})
	ctx, cancel := context.WithTimeout(operationContext, 2*time.Hour)
	defer cancel()
	request, e := http.NewRequestWithContext(ctx, "POST", aiURL+"/api/pull", bytes.NewReader(data))
	if e != nil {
		return e
	}
	request.Header.Set("Content-Type", "application/json")
	c := http.Client{Timeout: 2 * time.Hour, Transport: &http.Transport{Proxy: nil}}
	r, e := c.Do(request)
	if e != nil {
		return errors.New("Starter AI model download failed. Reopen setup to resume; your saved office was kept")
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return fmt.Errorf("Local AI model setup returned HTTP %d", r.StatusCode)
	}
	scanner := bufio.NewScanner(r.Body)
	scanner.Buffer(make([]byte, 65536), 1024*1024)
	complete := false
	last := time.Time{}
	for scanner.Scan() {
		var event struct {
			Status, Error    string
			Total, Completed int64
		}
		if e = json.Unmarshal(scanner.Bytes(), &event); e != nil {
			return e
		}
		if event.Error != "" {
			return errors.New("Local AI model download failed; retry setup with working internet and sufficient space")
		}
		if event.Status == "success" {
			complete = true
		}
		if time.Since(last) > time.Second {
			last = time.Now()
			if event.Total > 0 {
				progress(fmt.Sprintf("Preparing your automatic AI model: %d%%. Model selection and connection are automatic.", event.Completed*100/event.Total))
			} else {
				progress("Preparing your automatic AI model: " + event.Status)
			}
		}
	}
	if e = scanner.Err(); e != nil {
		return e
	}
	if !complete {
		return errors.New("AI model download ended without success; saved partial downloads can resume")
	}
	models, e = aiGetTags()
	if e != nil {
		return e
	}
	for _, name := range models {
		if name == model {
			return nil
		}
	}
	return errors.New("AI engine did not confirm the installed model")
}
func prepareBuiltInAI() (string, error) {
	memory, e := deviceMemory()
	if e != nil {
		return "", errors.New("Windows could not detect available device memory for automatic AI setup")
	}
	model, e := starterModel(memory)
	if e != nil {
		return "", e
	}
	if e = ensureAIProcess(); e != nil {
		return "", e
	}
	if e = pullAIModel(model); e != nil {
		return "", e
	}
	return model, nil
}
func verifyAIConfiguration(node, app, model string) error {
	progress("Testing genuine local AI, then saving the automatic connection. First startup may take several minutes.")
	helper := filepath.Join(app, "scripts", "configure-local-ai.mjs")
	c := exec.CommandContext(operationContext, node, helper, filepath.Join(root, "data", "headquarters.sqlite"), model)
	hidden(c)
	c.Env = append(os.Environ(), "HQ_OLLAMA_PORT="+managedAIPort)
	if e := c.Run(); e != nil {
		return errors.New("The model installed but its local inference check did not complete. Reopen setup to retry; no successful AI work was invented")
	}
	return nil
}

// Status writes are separate from inference/configuration. They never select a
// model or claim readiness, and cancellation still allows a short final update.
func markAISetup(node, app, status string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	helper := filepath.Join(app, "scripts", "configure-local-ai.mjs")
	c := exec.CommandContext(ctx, node, helper, filepath.Join(root, "data", "headquarters.sqlite"), "--status", status)
	hidden(c)
	if e := c.Run(); e != nil {
		return errors.New("Local AI preparation status could not be saved")
	}
	return nil
}
