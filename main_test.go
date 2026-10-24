package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func setupTestVault(t *testing.T) (*VaultService, string) {
	tempDir, err := os.MkdirTemp("", "gosidian-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	service := &VaultService{
		currentVault: tempDir,
	}
	return service, tempDir
}

func cleanupTestVault(dir string) {
	_ = os.RemoveAll(dir)
}

func TestVaultService_InitAndInfo(t *testing.T) {
	service, tempDir := setupTestVault(t)
	defer cleanupTestVault(tempDir)

	info, err := service.InitDefaultVault()
	if err != nil {
		t.Fatalf("InitDefaultVault failed: %v", err)
	}

	if info.Path != tempDir {
		t.Errorf("Expected vault path %q, got %q", tempDir, info.Path)
	}

	if info.NoteCount < 1 {
		t.Errorf("Expected at least 1 starter note, got %d", info.NoteCount)
	}
	welcomePath := filepath.Join(tempDir, "Welcome to Gosidian.md")
	if _, err := os.Stat(welcomePath); os.IsNotExist(err) {
		t.Errorf("Expected Welcome to Gosidian.md to exist in initialized vault")
	}

	sysInfo := service.GetInfo()
	if sysInfo.OS == "" || sysInfo.GoVersion == "" {
		t.Errorf("GetInfo returned incomplete telemetry: %+v", sysInfo)
	}
}

func TestVaultService_FileCRUD(t *testing.T) {
	service, tempDir := setupTestVault(t)
	defer cleanupTestVault(tempDir)

	// Create note
	created, err := service.CreateNote("test-note.md", "# Hello World\nThis is a test note.")
	if err != nil {
		t.Fatalf("CreateNote failed: %v", err)
	}
	if created.Name != "test-note.md" {
		t.Errorf("Expected note name 'test-note.md', got %q", created.Name)
	}

	// Read note
	content, err := service.ReadFile("test-note.md")
	if err != nil {
		t.Fatalf("ReadFile failed: %v", err)
	}
	if !strings.Contains(content, "Hello World") {
		t.Errorf("ReadFile content mismatch: %q", content)
	}

	// Save note
	newContent := "# Updated Content\nNew line here."
	err = service.SaveFile("test-note.md", newContent)
	if err != nil {
		t.Fatalf("SaveFile failed: %v", err)
	}

	content, _ = service.ReadFile("test-note.md")
	if !strings.Contains(content, "Updated Content") {
		t.Errorf("SaveFile did not persist: %q", content)
	}

	// Rename note
	err = service.RenamePath("test-note.md", "renamed-note.md")
	if err != nil {
		t.Fatalf("RenamePath failed: %v", err)
	}

	_, err = service.ReadFile("test-note.md")
	if err == nil {
		t.Errorf("Expected error reading old file name, but got nil")
	}

	content, err = service.ReadFile("renamed-note.md")
	if err != nil || !strings.Contains(content, "Updated Content") {
		t.Errorf("ReadFile on renamed note failed: %v", err)
	}

	// Delete note
	err = service.DeletePath("renamed-note.md")
	if err != nil {
		t.Fatalf("DeletePath failed: %v", err)
	}

	_, err = service.ReadFile("renamed-note.md")
	if err == nil {
		t.Errorf("Expected error reading deleted file, but got nil")
	}
}

func TestVaultService_FolderAndTree(t *testing.T) {
	service, tempDir := setupTestVault(t)
	defer cleanupTestVault(tempDir)

	err := service.CreateFolder("Research/Deep Learning")
	if err != nil {
		t.Fatalf("CreateFolder failed: %v", err)
	}

	_, err = service.CreateNote("Research/Deep Learning/Transformers.md", "# Transformers\nAttention is all you need.")
	if err != nil {
		t.Fatalf("CreateNote in folder failed: %v", err)
	}

	tree, err := service.ListTree()
	if err != nil {
		t.Fatalf("ListTree failed: %v", err)
	}

	foundFolder := false
	for _, node := range tree {
		if node.Name == "Research" && node.IsDir {
			foundFolder = true
			if len(node.Children) == 0 {
				t.Errorf("Expected Research folder to have children")
			}
		}
	}
	if !foundFolder {
		t.Errorf("Research folder not found in file tree")
	}
}

func TestVaultService_Search(t *testing.T) {
	service, tempDir := setupTestVault(t)
	defer cleanupTestVault(tempDir)

	_, _ = service.CreateNote("NoteA.md", "# Alpha\nKeyword uniqueQuerySecret in NoteA.")
	_, _ = service.CreateNote("NoteB.md", "# Beta\nOther text here.")

	results, err := service.SearchVault("uniqueQuerySecret")
	if err != nil {
		t.Fatalf("SearchVault failed: %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("Expected 1 search result, got %d", len(results))
	}
	if results[0].Name != "NoteA.md" {
		t.Errorf("Expected result 'NoteA.md', got %q", results[0].Name)
	}
	if len(results[0].Matches) == 0 {
		t.Errorf("Expected match snippet, got none")
	}
}

func TestVaultService_GraphData(t *testing.T) {
	service, tempDir := setupTestVault(t)
	defer cleanupTestVault(tempDir)

	_, _ = service.CreateNote("NoteOne.md", "# Note One\nLinking to [[NoteTwo]] with #graph tag.")
	_, _ = service.CreateNote("NoteTwo.md", "# Note Two\nTarget note.")

	graph, err := service.GetGraphData()
	if err != nil {
		t.Fatalf("GetGraphData failed: %v", err)
	}

	if len(graph.Nodes) < 2 {
		t.Fatalf("Expected at least 2 nodes, got %d", len(graph.Nodes))
	}

	foundLink := false
	for _, link := range graph.Links {
		if strings.ToLower(link.Source) == "noteone" && strings.ToLower(link.Target) == "notetwo" {
			foundLink = true
			break
		}
	}
	if !foundLink {
		t.Errorf("Expected link from noteone to notetwo in graph data, got %+v", graph.Links)
	}
}

func TestVaultService_SnapshotRecovery(t *testing.T) {
	service, tempDir := setupTestVault(t)
	defer cleanupTestVault(tempDir)

	initialText := "# Version 1\nInitial content."
	_, err := service.CreateNote("history.md", initialText)
	if err != nil {
		t.Fatalf("CreateNote failed: %v", err)
	}

	// Update to version 2 (should trigger snapshot of version 1)
	v2Text := "# Version 2\nUpdated content."
	err = service.SaveFile("history.md", v2Text)
	if err != nil {
		t.Fatalf("SaveFile v2 failed: %v", err)
	}

	snapshots, err := service.GetFileSnapshots("history.md")
	if err != nil {
		t.Fatalf("GetFileSnapshots failed: %v", err)
	}

	if len(snapshots) != 1 {
		t.Fatalf("Expected 1 historical snapshot, got %d", len(snapshots))
	}
	if snapshots[0].Content != initialText {
		t.Errorf("Snapshot content mismatch. Expected %q, got %q", initialText, snapshots[0].Content)
	}

	// Restore snapshot
	err = service.RestoreSnapshot("history.md", snapshots[0].ID)
	if err != nil {
		t.Fatalf("RestoreSnapshot failed: %v", err)
	}

	restoredContent, err := service.ReadFile("history.md")
	if err != nil {
		t.Fatalf("ReadFile after restore failed: %v", err)
	}
	if restoredContent != initialText {
		t.Errorf("Expected content restored to version 1, got %q", restoredContent)
	}
}

func TestVaultService_Canvas(t *testing.T) {
	service, tempDir := setupTestVault(t)
	defer cleanupTestVault(tempDir)

	canvasNode, err := service.CreateCanvas("MyBoard")
	if err != nil {
		t.Fatalf("CreateCanvas failed: %v", err)
	}

	if !strings.HasSuffix(canvasNode.Path, ".canvas") {
		t.Errorf("Expected .canvas extension, got %q", canvasNode.Path)
	}

	content, err := service.ReadFile(canvasNode.Path)
	if err != nil {
		t.Fatalf("ReadFile on canvas failed: %v", err)
	}

	if !strings.Contains(content, "\"nodes\"") || !strings.Contains(content, "\"edges\"") {
		t.Errorf("Canvas file missing nodes or edges JSON structure")
	}
}
