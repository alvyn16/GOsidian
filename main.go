package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/egoist/mygo"
)

// FileNode represents a file or directory in the vault
type FileNode struct {
	Name     string     `json:"name"`
	Path     string     `json:"path"`
	IsDir    bool       `json:"isDir"`
	Children []FileNode `json:"children,omitempty"`
	Size     int64      `json:"size"`
	ModTime  int64      `json:"modTime"`
}

// SearchMatch represents a single search occurrence
type SearchMatch struct {
	LineNumber int    `json:"lineNumber"`
	LineText   string `json:"lineText"`
}

// SearchResult groups search matches for a single file
type SearchResult struct {
	Path    string        `json:"path"`
	Name    string        `json:"name"`
	Matches []SearchMatch `json:"matches"`
}

// GraphNode represents a node in the graph view
type GraphNode struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Path      string   `json:"path"`
	Tags      []string `json:"tags"`
	LinkCount int      `json:"linkCount"`
}

// GraphLink represents an edge in the graph view
type GraphLink struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

// GraphData contains all nodes and edges for the graph view
type GraphData struct {
	Nodes []GraphNode `json:"nodes"`
	Links []GraphLink `json:"links"`
}

// VaultInfo provides metadata about the current vault
type VaultInfo struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	NoteCount int    `json:"noteCount"`
}

// SystemInfo describes the system environment
type SystemInfo struct {
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	GoVersion string `json:"goVersion"`
	VaultPath string `json:"vaultPath"`
}

// SnapshotItem represents a historical recovery snapshot of a note
type SnapshotItem struct {
	ID        string `json:"id"`
	Path      string `json:"path"`
	Timestamp int64  `json:"timestamp"`
	DateStr   string `json:"dateStr"`
	Size      int64  `json:"size"`
	Content   string `json:"content"`
}

// AppConfig persists user settings such as vault location
type AppConfig struct {
	VaultPath string `json:"vaultPath"`
}

func getConfigFile() string {
	dir, err := os.UserConfigDir()
	if err != nil || dir == "" {
		dir = getAppDir()
	}
	return filepath.Join(dir, "Gosidian", "config.json")
}

func loadConfig() AppConfig {
	var cfg AppConfig
	data, err := os.ReadFile(getConfigFile())
	if err == nil {
		_ = json.Unmarshal(data, &cfg)
	}
	return cfg
}

func saveConfig(cfg AppConfig) error {
	file := getConfigFile()
	if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(file, data, 0644)
}

// VaultService is the bound Go service exposed to the frontend
type VaultService struct {
	currentVault string
}

func getAppDir() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "."
	}
	return cwd
}

func getDefaultVaultPath() string {
	home, err := os.UserHomeDir()
	if err == nil && home != "" {
		return filepath.Join(home, "Documents", "Gosidian Vault")
	}
	return filepath.Join(getAppDir(), "vault")
}

func (s *VaultService) getActiveVault() string {
	if s.currentVault != "" {
		return s.currentVault
	}
	cfg := loadConfig()
	if strings.TrimSpace(cfg.VaultPath) != "" {
		s.currentVault = cfg.VaultPath
		return s.currentVault
	}
	return getDefaultVaultPath()
}

// IsConfigured returns true if user has chosen a vault before
func (s *VaultService) IsConfigured() bool {
	cfg := loadConfig()
	return strings.TrimSpace(cfg.VaultPath) != ""
}

// GetDefaultPath returns the suggested default vault path
func (s *VaultService) GetDefaultPath() string {
	return getDefaultVaultPath()
}

// ChooseFolderDialog opens the native OS directory selector
func (s *VaultService) ChooseFolderDialog() (string, error) {
	if runtime.GOOS == "windows" {
		cmd := exec.Command("powershell", "-NoProfile", "-Command", `
			Add-Type -AssemblyName System.Windows.Forms
			$f = New-Object System.Windows.Forms.FolderBrowserDialog
			$f.Description = "Select a folder to use as your Gosidian vault"
			$f.ShowNewFolderButton = $true
			if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
				Write-Output $f.SelectedPath
			}
		`)
		out, err := cmd.Output()
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(out)), nil
	}
	return "", nil
}

// GetInfo returns system information
func (s *VaultService) GetInfo() SystemInfo {
	return SystemInfo{
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
		GoVersion: runtime.Version(),
		VaultPath: s.getActiveVault(),
	}
}

// GetVaultInfo returns metadata about current vault
func (s *VaultService) GetVaultInfo() VaultInfo {
	vault := s.getActiveVault()
	count := 0
	_ = filepath.WalkDir(vault, func(path string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			low := strings.ToLower(d.Name())
			if strings.HasSuffix(low, ".md") || strings.HasSuffix(low, ".canvas") {
				count++
			}
		}
		return nil
	})

	return VaultInfo{
		Path:      vault,
		Name:      filepath.Base(vault),
		NoteCount: count,
	}
}

// SetVaultPath changes the active vault folder
func (s *VaultService) SetVaultPath(path string) (VaultInfo, error) {
	cleanPath := strings.TrimSpace(path)
	if cleanPath == "" {
		s.currentVault = getDefaultVaultPath()
	} else {
		abs, err := filepath.Abs(cleanPath)
		if err != nil {
			return VaultInfo{}, err
		}
		s.currentVault = abs
	}
	if err := os.MkdirAll(s.currentVault, 0755); err != nil {
		return VaultInfo{}, err
	}
	_ = saveConfig(AppConfig{VaultPath: s.currentVault})

	welcomeNote := filepath.Join(s.currentVault, "Welcome to Gosidian.md")
	if _, err := os.Stat(welcomeNote); os.IsNotExist(err) {
		s.createStarterNotes(s.currentVault)
	}

	return s.GetVaultInfo(), nil
}

// InitDefaultVault initializes starter notes if the vault is empty
func (s *VaultService) InitDefaultVault() (VaultInfo, error) {
	vault := s.getActiveVault()
	if err := os.MkdirAll(vault, 0755); err != nil {
		return VaultInfo{}, err
	}

	welcomeNote := filepath.Join(vault, "Welcome to Gosidian.md")
	if _, err := os.Stat(welcomeNote); os.IsNotExist(err) {
		s.createStarterNotes(vault)
	}

	return s.GetVaultInfo(), nil
}

func (s *VaultService) createStarterNotes(vault string) {
	welcomeNote := filepath.Join(vault, "Welcome to Gosidian.md")
	content := "# Welcome to Gosidian 🟣\n\n" +
		"![Gosidian Neural Knowledge Network](/assets/banner.jpg)\n\n" +
		"Gosidian is a high-performance **Obsidian clone** built with **MyGo** (pure Go desktop framework) and an authentic web frontend.\n\n" +
		"> [!NOTE] Knowledge Base at the Speed of Go\n" +
		"> All your notes are saved as local Markdown files in your vault. No proprietary lock-in, zero cloud tracking, and blazing native performance.\n\n" +
		"## Key Features\n\n" +
		"- **Pele Diagram Engine**: Ultra-fast SVG flowcharts and sequence diagrams rendered natively.\n" +
		"```pele\n" +
		"flowchart LR\n" +
		"    A[💡 Idea] --> B[⚙️ Gosidian]\n" +
		"    B --> C[🚀 Innovation]\n" +
		"```\n\n" +
		"- **LaTeX Mathematics**: KaTeX equations rendered in real-time:\n" +
		"$$E = mc^2 \\quad \\text{and} \\quad \\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$\n\n" +
		"- **Interactive Knowledge Graph**: Force-directed spring & Coulomb physics graph visualization (press `Ctrl+G`).\n" +
		"- **Infinite 2D Spatial Canvas**: Visual thought mapping on infinite canvas (`.canvas`).\n" +
		"- **Local Version Recovery**: Automatic background snapshot history in `.gosidian/recovery`.\n" +
		"- **Custom Hotkeys & Command Palette**: Full hotkey re-binding and instant command access (`Ctrl+P`).\n\n" +
		"## Getting Started\n" +
		"- [x] Choose your vault location\n" +
		"- [x] Launch Gosidian desktop app\n" +
		"- [ ] Create your first note by pressing `Ctrl+N`\n" +
		"- [ ] Try creating links with [[WikiLinks]]\n"

	_ = os.WriteFile(welcomeNote, []byte(content), 0644)
}

// ListTree returns the recursive file tree of the vault
func (s *VaultService) ListTree() ([]FileNode, error) {
	vault := s.getActiveVault()
	return s.readDir(vault, "")
}

func (s *VaultService) readDir(baseDir string, relDir string) ([]FileNode, error) {
	target := filepath.Join(baseDir, relDir)
	entries, err := os.ReadDir(target)
	if err != nil {
		return nil, err
	}

	var nodes []FileNode
	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue // skip hidden files/.git
		}
		relPath := filepath.Join(relDir, name)
		relPath = filepath.ToSlash(relPath)
		info, err := entry.Info()
		if err != nil {
			continue
		}

		if entry.IsDir() {
			children, _ := s.readDir(baseDir, relPath)
			nodes = append(nodes, FileNode{
				Name:     name,
				Path:     relPath,
				IsDir:    true,
				Children: children,
				ModTime:  info.ModTime().Unix(),
			})
		} else {
			low := strings.ToLower(name)
			if strings.HasSuffix(low, ".md") || strings.HasSuffix(low, ".markdown") || strings.HasSuffix(low, ".txt") || strings.HasSuffix(low, ".canvas") {
				nodes = append(nodes, FileNode{
					Name:    name,
					Path:    relPath,
					IsDir:   false,
					Size:    info.Size(),
					ModTime: info.ModTime().Unix(),
				})
			}
		}
	}
	return nodes, nil
}

// ReadFile reads the text content of a file relative to vault
func (s *VaultService) ReadFile(relPath string) (string, error) {
	vault := s.getActiveVault()
	fullPath := filepath.Join(vault, filepath.FromSlash(relPath))
	data, err := os.ReadFile(fullPath)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (s *VaultService) recoveryDir(relPath string) string {
	vault := s.getActiveVault()
	clean := strings.ReplaceAll(relPath, "/", "__")
	clean = strings.ReplaceAll(clean, "\\", "__")
	return filepath.Join(vault, ".gosidian", "recovery", clean)
}

// SaveFile writes the text content to a file in the vault with automatic snapshot recovery
func (s *VaultService) SaveFile(relPath string, content string) error {
	vault := s.getActiveVault()
	fullPath := filepath.Join(vault, filepath.FromSlash(relPath))
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	// Capture previous version as recovery snapshot if content has changed
	if oldBytes, err := os.ReadFile(fullPath); err == nil && len(oldBytes) > 0 {
		if string(oldBytes) != content {
			recDir := s.recoveryDir(relPath)
			_ = os.MkdirAll(recDir, 0755)
			snapFile := filepath.Join(recDir, fmt.Sprintf("%d.snap", time.Now().UnixNano()))
			_ = os.WriteFile(snapFile, oldBytes, 0644)
		}
	}

	return os.WriteFile(fullPath, []byte(content), 0644)
}

// GetFileSnapshots returns all saved recovery snapshots for a file
func (s *VaultService) GetFileSnapshots(relPath string) ([]SnapshotItem, error) {
	recDir := s.recoveryDir(relPath)
	entries, err := os.ReadDir(recDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []SnapshotItem{}, nil
		}
		return nil, err
	}

	var items []SnapshotItem
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".snap") {
			continue
		}
		snapPath := filepath.Join(recDir, entry.Name())
		data, err := os.ReadFile(snapPath)
		if err != nil {
			continue
		}
		info, _ := entry.Info()
		var tsNano int64
		fmt.Sscanf(entry.Name(), "%d.snap", &tsNano)
		ts := tsNano / int64(time.Millisecond)
		if ts == 0 && info != nil {
			ts = info.ModTime().UnixMilli()
		}
		tObj := time.UnixMilli(ts)

		items = append(items, SnapshotItem{
			ID:        entry.Name(),
			Path:      relPath,
			Timestamp: ts,
			DateStr:   tObj.Format("2006-01-02 15:04:05"),
			Size:      int64(len(data)),
			Content:   string(data),
		})
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].Timestamp > items[j].Timestamp
	})

	return items, nil
}

// RestoreSnapshot rolls back a note to a historical snapshot
func (s *VaultService) RestoreSnapshot(relPath string, snapshotID string) error {
	recDir := s.recoveryDir(relPath)
	snapPath := filepath.Join(recDir, snapshotID)
	data, err := os.ReadFile(snapPath)
	if err != nil {
		return err
	}
	return s.SaveFile(relPath, string(data))
}

// CreateCanvas creates a new .canvas infinite spatial file
func (s *VaultService) CreateCanvas(relPath string) (FileNode, error) {
	if !strings.HasSuffix(strings.ToLower(relPath), ".canvas") {
		relPath += ".canvas"
	}
	defaultCanvasContent := "{\n  \"nodes\": [\n    {\n      \"id\": \"node-1\",\n      \"type\": \"text\",\n      \"x\": 100,\n      \"y\": 100,\n      \"width\": 280,\n      \"height\": 160,\n      \"text\": \"## Canvas Note 🎨\\n\\nDouble-click to edit card or drag to move.\"\n    }\n  ],\n  \"edges\": []\n}"
	return s.CreateNote(relPath, defaultCanvasContent)
}

// CreateNote creates a new markdown or canvas note
func (s *VaultService) CreateNote(relPath string, content string) (FileNode, error) {
	low := strings.ToLower(relPath)
	if !strings.HasSuffix(low, ".md") && !strings.HasSuffix(low, ".canvas") {
		relPath += ".md"
	}
	relPath = filepath.ToSlash(relPath)
	vault := s.getActiveVault()
	fullPath := filepath.Join(vault, filepath.FromSlash(relPath))

	// If file exists, find a unique name
	if _, err := os.Stat(fullPath); err == nil {
		dir := filepath.Dir(relPath)
		ext := filepath.Ext(relPath)
		base := strings.TrimSuffix(filepath.Base(relPath), ext)
		for i := 1; ; i++ {
			candRel := filepath.ToSlash(filepath.Join(dir, fmt.Sprintf("%s %d%s", base, i, ext)))
			candFull := filepath.Join(vault, filepath.FromSlash(candRel))
			if _, err := os.Stat(candFull); os.IsNotExist(err) {
				relPath = candRel
				fullPath = candFull
				break
			}
		}
	}

	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return FileNode{}, err
	}
	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		return FileNode{}, err
	}

	info, _ := os.Stat(fullPath)
	return FileNode{
		Name:    filepath.Base(relPath),
		Path:    relPath,
		IsDir:   false,
		Size:    info.Size(),
		ModTime: info.ModTime().Unix(),
	}, nil
}

// CreateFolder creates a directory in the vault
func (s *VaultService) CreateFolder(relPath string) error {
	vault := s.getActiveVault()
	fullPath := filepath.Join(vault, filepath.FromSlash(relPath))
	return os.MkdirAll(fullPath, 0755)
}

// DeletePath deletes a file or directory from the vault
func (s *VaultService) DeletePath(relPath string) error {
	vault := s.getActiveVault()
	fullPath := filepath.Join(vault, filepath.FromSlash(relPath))
	return os.RemoveAll(fullPath)
}

// RenamePath renames or moves a file or folder
func (s *VaultService) RenamePath(oldRel string, newRel string) error {
	vault := s.getActiveVault()
	oldFull := filepath.Join(vault, filepath.FromSlash(oldRel))
	newFull := filepath.Join(vault, filepath.FromSlash(newRel))
	dir := filepath.Dir(newFull)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return os.Rename(oldFull, newFull)
}

// SearchVault searches all markdown files for query
func (s *VaultService) SearchVault(query string) ([]SearchResult, error) {
	if strings.TrimSpace(query) == "" {
		return nil, nil
	}
	vault := s.getActiveVault()
	var results []SearchResult
	lowerQuery := strings.ToLower(query)

	_ = filepath.WalkDir(vault, func(fullPath string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(strings.ToLower(d.Name()), ".md") {
			return nil
		}

		rel, err := filepath.Rel(vault, fullPath)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)

		contentBytes, err := os.ReadFile(fullPath)
		if err != nil {
			return nil
		}
		lines := strings.Split(string(contentBytes), "\n")
		var matches []SearchMatch

		for idx, line := range lines {
			if strings.Contains(strings.ToLower(line), lowerQuery) {
				matches = append(matches, SearchMatch{
					LineNumber: idx + 1,
					LineText:   strings.TrimSpace(line),
				})
			}
		}

		if len(matches) > 0 {
			results = append(results, SearchResult{
				Path:    rel,
				Name:    d.Name(),
				Matches: matches,
			})
		}
		return nil
	})

	return results, nil
}

var (
	wikiLinkRegex = regexp.MustCompile(`\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]`)
	tagRegex      = regexp.MustCompile(`(?:^|\s)#([a-zA-Z0-9_-]+)`)
)

// GetGraphData scans all vault notes to build node & link graph
func (s *VaultService) GetGraphData() (GraphData, error) {
	vault := s.getActiveVault()
	nodesMap := make(map[string]*GraphNode)
	var links []GraphLink
	linkCounts := make(map[string]int)

	// Step 1: Collect all files as nodes
	_ = filepath.WalkDir(vault, func(fullPath string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(strings.ToLower(d.Name()), ".md") {
			return nil
		}
		rel, err := filepath.Rel(vault, fullPath)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		title := strings.TrimSuffix(filepath.Base(rel), ".md")
		id := strings.ToLower(title)

		contentBytes, _ := os.ReadFile(fullPath)
		content := string(contentBytes)

		// Find tags
		tagMatches := tagRegex.FindAllStringSubmatch(content, -1)
		tagSet := make(map[string]bool)
		for _, m := range tagMatches {
			if len(m) > 1 {
				tagSet[strings.ToLower(m[1])] = true
			}
		}
		var tags []string
		for t := range tagSet {
			tags = append(tags, t)
		}

		nodesMap[id] = &GraphNode{
			ID:    id,
			Title: title,
			Path:  rel,
			Tags:  tags,
		}
		return nil
	})

	// Step 2: Parse wiki links for edges
	for id, node := range nodesMap {
		fullPath := filepath.Join(vault, filepath.FromSlash(node.Path))
		contentBytes, err := os.ReadFile(fullPath)
		if err != nil {
			continue
		}
		content := string(contentBytes)
		matches := wikiLinkRegex.FindAllStringSubmatch(content, -1)
		seenTargets := make(map[string]bool)

		for _, m := range matches {
			if len(m) > 1 {
				targetTitle := strings.TrimSpace(m[1])
				targetID := strings.ToLower(targetTitle)
				if targetID == "" || targetID == id || seenTargets[targetID] {
					continue
				}
				seenTargets[targetID] = true

				// If target does not exist as an actual note yet, add as phantom node
				if _, exists := nodesMap[targetID]; !exists {
					nodesMap[targetID] = &GraphNode{
						ID:    targetID,
						Title: targetTitle,
						Path:  targetTitle + ".md",
						Tags:  nil,
					}
				}

				links = append(links, GraphLink{
					Source: id,
					Target: targetID,
				})
				linkCounts[id]++
				linkCounts[targetID]++
			}
		}
	}

	var nodes []GraphNode
	for id, node := range nodesMap {
		node.LinkCount = linkCounts[id]
		nodes = append(nodes, *node)
	}

	return GraphData{
		Nodes: nodes,
		Links: links,
	}, nil
}

// OpenInOS opens the file or directory in the system file manager
func (s *VaultService) OpenInOS(relPath string) error {
	vault := s.getActiveVault()
	fullPath := filepath.Join(vault, filepath.FromSlash(relPath))
	if runtime.GOOS == "windows" {
		cmd := exec.Command("explorer.exe", "/select,", fullPath)
		return cmd.Start()
	}
	return nil
}

func main() {
	mygo.Bind(&VaultService{})
	mygo.App.WhenReady(func() {
		mygo.NewWindow(mygo.WindowOptions{
			Title: "Gosidian",
			URL:   "/",
		})
	})
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}
