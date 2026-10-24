// ==========================================================================
// Gosidian: Complete Obsidian Clone Client in MyGo
// ==========================================================================

import { createIcons, icons } from "lucide";
import { isMyGo } from "mygo-runtime";
import { VaultService, type FileNode, type GraphData, type SearchResult, type VaultInfo, type SystemInfo, type SnapshotItem } from "./mygo";
import { SpatialCanvas, type CanvasData } from "./canvas";
import { parseMarkdown, type HeadingItem } from "./markdown";
import { ForceGraph, type SimNode, type GraphPhysicsConfig } from "./graph";

interface Tab {
  id: string;
  path: string;
  title: string;
  isDirty?: boolean;
  isGraph?: boolean;
  isCanvas?: boolean;
}

interface CommandItem {
  id: string;
  title: string;
  shortcut?: string;
  icon: string;
  action: () => void;
}

// Starter notes for browser preview mode or initial vault
const STARTER_NOTES: Record<string, string> = {
  "Welcome to Gosidian.md": `# Welcome to Gosidian 🟣

![Gosidian Neural Knowledge Network](/assets/banner.jpg)

Gosidian is a high-performance **Obsidian clone** built with **MyGo** (pure Go desktop framework) and an authentic web frontend.

> [!NOTE] Knowledge Base at the Speed of Go
> All your notes are saved as local Markdown files in your vault. No proprietary lock-in, zero cloud tracking, and blazing native performance.

## Key Features

- **Pele Diagram Engine**: Ultra-fast SVG flowcharts and sequence diagrams rendered natively.
\`\`\`pele
flowchart LR
    A[💡 Idea] --> B[⚙️ Gosidian]
    B --> C[🚀 Innovation]
\`\`\`

- **LaTeX Mathematics**: KaTeX equations rendered in real-time:
$$E = mc^2 \\quad \\text{and} \\quad \\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$

- **Interactive Knowledge Graph**: Force-directed spring & Coulomb physics graph visualization (press \`Ctrl+G\`).
- **Infinite 2D Spatial Canvas**: Visual thought mapping on infinite canvas (\`.canvas\`).
- **Local Version Recovery**: Automatic background snapshot history in \`.gosidian/recovery\`.
- **Custom Hotkeys & Command Palette**: Full hotkey re-binding and instant command access (\`Ctrl+P\`).

## Getting Started
- [x] Choose your vault location
- [x] Launch Gosidian desktop app
- [ ] Create your first note by pressing \`Ctrl+N\`
- [ ] Try creating links with [[WikiLinks]]
`,
};

// Unified Vault Client Bridge: calls Go backend in MyGo, falls back to memory storage in browser
class VaultClient {
  private inMemoryNotes: Map<string, string> = new Map();

  constructor() {
    if (!isMyGo()) {
      for (const [k, v] of Object.entries(STARTER_NOTES)) {
        this.inMemoryNotes.set(k, v);
      }
    }
  }

  async isConfigured(): Promise<boolean> {
    if (isMyGo()) return VaultService.isConfigured();
    return !!localStorage.getItem("gosidian_vault_path");
  }

  async getDefaultPath(): Promise<string> {
    if (isMyGo()) return VaultService.getDefaultPath();
    return "Documents/Gosidian Vault";
  }

  async chooseFolderDialog(): Promise<string> {
    if (isMyGo()) return VaultService.chooseFolderDialog();
    return prompt("Enter directory path for vault:") || "";
  }

  async initDefaultVault(): Promise<VaultInfo> {
    if (isMyGo()) return VaultService.initDefaultVault();
    return { name: "gosidian-vault", path: "vault", noteCount: this.inMemoryNotes.size };
  }

  async setVaultPath(path: string): Promise<VaultInfo> {
    if (isMyGo()) return VaultService.setVaultPath(path);
    localStorage.setItem("gosidian_vault_path", path);
    return { name: path.split(/[\/\\]/).pop() || "vault", path, noteCount: this.inMemoryNotes.size };
  }

  async getVaultInfo(): Promise<VaultInfo> {
    if (isMyGo()) return VaultService.getVaultInfo();
    return { name: "gosidian-vault", path: "vault", noteCount: this.inMemoryNotes.size };
  }

  async listTree(): Promise<FileNode[]> {
    if (isMyGo()) return VaultService.listTree();
    // Build tree from in-memory map
    const rootNodes: FileNode[] = [];
    const dirMap = new Map<string, FileNode>();

    for (const [path, content] of this.inMemoryNotes.entries()) {
      const parts = path.split("/");
      if (parts.length > 1) {
        const dirName = parts[0]!;
        if (!dirMap.has(dirName)) {
          const dirNode: FileNode = {
            name: dirName,
            path: dirName,
            isDir: true,
            children: [],
            size: 0,
            modTime: Date.now(),
          };
          dirMap.set(dirName, dirNode);
          rootNodes.push(dirNode);
        }
        dirMap.get(dirName)!.children!.push({
          name: parts[1]!,
          path,
          isDir: false,
          size: content.length,
          modTime: Date.now(),
        });
      } else {
        rootNodes.push({
          name: path,
          path,
          isDir: false,
          size: content.length,
          modTime: Date.now(),
        });
      }
    }
    return rootNodes;
  }

  async readFile(relPath: string): Promise<string> {
    if (isMyGo()) return VaultService.readFile(relPath);
    const content = this.inMemoryNotes.get(relPath);
    if (content === undefined) throw new Error("File not found: " + relPath);
    return content;
  }

  async saveFile(relPath: string, content: string): Promise<void> {
    if (isMyGo()) return VaultService.saveFile(relPath, content);
    this.inMemoryNotes.set(relPath, content);
  }

  async createNote(relPath: string, content: string): Promise<FileNode> {
    if (isMyGo()) return VaultService.createNote(relPath, content);
    if (!relPath.endsWith(".md")) relPath += ".md";
    this.inMemoryNotes.set(relPath, content);
    return {
      name: relPath.split("/").pop()!,
      path: relPath,
      isDir: false,
      size: content.length,
      modTime: Date.now(),
    };
  }

  async createFolder(relPath: string): Promise<void> {
    if (isMyGo()) return VaultService.createFolder(relPath);
  }

  async deletePath(relPath: string): Promise<void> {
    if (isMyGo()) return VaultService.deletePath(relPath);
    this.inMemoryNotes.delete(relPath);
  }

  async renamePath(oldRel: string, newRel: string): Promise<void> {
    if (isMyGo()) return VaultService.renamePath(oldRel, newRel);
    const content = this.inMemoryNotes.get(oldRel);
    if (content !== undefined) {
      this.inMemoryNotes.delete(oldRel);
      this.inMemoryNotes.set(newRel, content);
    }
  }

  async searchVault(query: string): Promise<SearchResult[]> {
    if (isMyGo()) return VaultService.searchVault(query);
    if (!query.trim()) return [];
    const results: SearchResult[] = [];
    const lower = query.toLowerCase();

    for (const [path, content] of this.inMemoryNotes.entries()) {
      const lines = content.split("\n");
      const matches = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.toLowerCase().includes(lower)) {
          matches.push({ lineNumber: i + 1, lineText: lines[i]!.trim() });
        }
      }
      if (matches.length > 0) {
        results.push({
          path,
          name: path.split("/").pop()!,
          matches,
        });
      }
    }
    return results;
  }

  async getFileSnapshots(relPath: string): Promise<SnapshotItem[]> {
    if (isMyGo()) return VaultService.getFileSnapshots(relPath);
    return [];
  }

  async restoreSnapshot(relPath: string, snapshotId: string): Promise<void> {
    if (isMyGo()) return VaultService.restoreSnapshot(relPath, snapshotId);
  }

  async createCanvas(relPath: string): Promise<FileNode> {
    if (isMyGo()) return VaultService.createCanvas(relPath);
    if (!relPath.endsWith(".canvas")) relPath += ".canvas";
    const defaultContent = "{\n  \"nodes\": [\n    {\n      \"id\": \"c-1\",\n      \"type\": \"text\",\n      \"x\": 80,\n      \"y\": 80,\n      \"width\": 280,\n      \"height\": 180,\n      \"text\": \"## Project Vision 🚀\\\\n\\\\nBuilding an authentic Obsidian clone with **MyGo** and **pure Go**.\\\\n\\\\n- Zero Chromium bloat\\\\n- Infinite spatial canvas\\\\n- Real-time physics graph\"\n    },\n    {\n      \"id\": \"c-2\",\n      \"type\": \"text\",\n      \"x\": 460,\n      \"y\": 80,\n      \"width\": 280,\n      \"height\": 180,\n      \"text\": \"## Architecture 🏛️\\\\n\\\\n- **Go 1.27 + MyGo**: Local vault file system\\\\n- **WebView2**: Authentic UI runtime\\\\n- **Pele**: Fast SVG diagram rendering\\\\n- **KaTeX**: LaTeX math formulas\"\n    },\n    {\n      \"id\": \"c-3\",\n      \"type\": \"text\",\n      \"x\": 270,\n      \"y\": 340,\n      \"width\": 300,\n      \"height\": 160,\n      \"text\": \"## Spatial Thinking 🎨\\\\n\\\\nPan, zoom, drag cards, and connect thoughts in 2D space!\"\n    }\n  ],\n  \"edges\": [\n    {\n      \"id\": \"e-1\",\n      \"fromNode\": \"c-1\",\n      \"toNode\": \"c-2\",\n      \"fromSide\": \"right\",\n      \"toSide\": \"left\",\n      \"label\": \"powers\"\n    },\n    {\n      \"id\": \"e-2\",\n      \"fromNode\": \"c-1\",\n      \"toNode\": \"c-3\",\n      \"fromSide\": \"bottom\",\n      \"toSide\": \"top\",\n      \"label\": \"enables\"\n    },\n    {\n      \"id\": \"e-3\",\n      \"fromNode\": \"c-2\",\n      \"toNode\": \"c-3\",\n      \"fromSide\": \"bottom\",\n      \"toSide\": \"top\",\n      \"label\": \"visualized in\"\n    }\n  ]\n}";
    return this.createNote(relPath, defaultContent);
  }

  async getGraphData(): Promise<GraphData> {
    if (isMyGo()) return VaultService.getGraphData();
    const nodesMap = new Map<string, any>();
    const links: any[] = [];
    const linkCounts = new Map<string, number>();

    const linkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
    const tagRegex = /(?:^|\s)#([a-zA-Z0-9_-]+)/g;

    for (const [path, content] of this.inMemoryNotes.entries()) {
      const title = path.replace(/\.md$/i, "").split("/").pop()!;
      const id = title.toLowerCase();

      const tags: string[] = [];
      let m;
      while ((m = tagRegex.exec(content)) !== null) {
        if (m[1]) tags.push(m[1].toLowerCase());
      }

      nodesMap.set(id, {
        id,
        title,
        path,
        tags: Array.from(new Set(tags)),
        linkCount: 0,
      });
    }

    for (const [id, node] of nodesMap.entries()) {
      const content = this.inMemoryNotes.get(node.path) || "";
      let m;
      const seen = new Set<string>();
      while ((m = linkRegex.exec(content)) !== null) {
        if (m[1]) {
          const targetTitle = m[1].trim();
          const targetId = targetTitle.toLowerCase();
          if (targetId && targetId !== id && !seen.has(targetId)) {
            seen.add(targetId);
            if (!nodesMap.has(targetId)) {
              nodesMap.set(targetId, {
                id: targetId,
                title: targetTitle,
                path: targetTitle + ".md",
                tags: [],
                linkCount: 0,
              });
            }
            links.push({ source: id, target: targetId });
            linkCounts.set(id, (linkCounts.get(id) || 0) + 1);
            linkCounts.set(targetId, (linkCounts.get(targetId) || 0) + 1);
          }
        }
      }
    }

    const nodes = Array.from(nodesMap.values()).map((n) => ({
      ...n,
      linkCount: linkCounts.get(n.id) || 0,
    }));

    return { nodes, links };
  }

  async openInOS(relPath: string): Promise<void> {
    if (isMyGo()) return VaultService.openInOS(relPath);
  }

  async getInfo(): Promise<SystemInfo> {
    if (isMyGo()) return VaultService.getInfo();
    return {
      os: "windows",
      arch: "amd64",
      goVersion: "go1.27.3",
      vaultPath: "C:\\Users\\alvyn\\.t3\\projects\\gosidian\\vault",
    };
  }
}

const vaultClient = new VaultClient();

class GosidianApp {
  private activeVault: VaultInfo | null = null;
  private fileTree: FileNode[] = [];
  private flatNotesList: string[] = []; // relative paths
  private bookmarks = new Set<string>();

  private tabs: Tab[] = [];
  private activeTabIndex = -1;
  private history: string[] = [];
  private historyIndex = -1;

  private viewMode: "live" | "reading" | "split" = "live";
  private saveTimeout: number | null = null;

  private graph: ForceGraph | null = null;
  private spatialCanvas: SpatialCanvas | null = null;
  private activeRecoverySnapshots: SnapshotItem[] = [];
  private selectedRecoveryIndex = -1;
  private graphData: GraphData | null = null;

  private selectedSwitcherIndex = 0;
  private switcherResultsList: string[] = [];

  private selectedPaletteIndex = 0;
  private paletteFilteredCommands: CommandItem[] = [];

  private commands: CommandItem[] = [];
  private customHotkeys: Record<string, string> = {};
  private recordingCommandId: string | null = null;

  constructor() {
    this.loadCustomHotkeys();
    this.registerCommands();
    this.setupUI();
    this.setupHotkeys();
    this.initApp();
  }

  private loadCustomHotkeys() {
    try {
      const saved = localStorage.getItem("gosidian_custom_hotkeys");
      if (saved) {
        this.customHotkeys = JSON.parse(saved);
      }
    } catch {
      this.customHotkeys = {};
    }
  }

  private saveCustomHotkeys() {
    try {
      localStorage.setItem("gosidian_custom_hotkeys", JSON.stringify(this.customHotkeys));
    } catch {}
  }

  private getEffectiveShortcut(cmdId: string): string | undefined {
    if (this.customHotkeys[cmdId] !== undefined) {
      return this.customHotkeys[cmdId] || undefined;
    }
    const defaultCmd = this.commands.find((c) => c.id === cmdId);
    return defaultCmd?.shortcut;
  }

  private eventToShortcut(e: KeyboardEvent): string | null {
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");

    let k = e.key;
    if (k === " ") k = "Space";
    else if (k.length === 1) k = k.toUpperCase();
    parts.push(k);

    return parts.join("+");
  }

  // ------------------------------------------------------------------------
  // Initialization
  // ------------------------------------------------------------------------

  private async initApp() {
    try {
      this.updateSaveIndicator("saving", "Checking vault configuration...");
      let isConfigured = false;
      let defaultPath = "";
      try {
        isConfigured = await vaultClient.isConfigured();
        defaultPath = await vaultClient.getDefaultPath();
      } catch {
        isConfigured = !!localStorage.getItem("gosidian_vault_path");
        defaultPath = "Documents/Gosidian Vault";
      }

      if (!isConfigured) {
        await this.openVaultChooserModal(defaultPath, false);
      } else {
        const vault = await vaultClient.initDefaultVault();
        this.activeVault = vault;
        this.updateVaultDisplay(vault);

        await this.refreshFileTree();
        await this.refreshTags();

        // Open Welcome Note or first available note
        if (this.flatNotesList.includes("Welcome to Gosidian.md")) {
          await this.openNote("Welcome to Gosidian.md");
        } else if (this.flatNotesList.length > 0 && this.flatNotesList[0]) {
          await this.openNote(this.flatNotesList[0]);
        } else {
          await this.handleNewNote();
        }

        this.updateSaveIndicator("saved", "Ready");
      }
    } catch (err) {
      console.error("Failed to initialize vault:", err);
      this.updateSaveIndicator("saving", "Backend error");
    }
  }

  public async openVaultChooserModal(defaultPath?: string, canCancel = true) {
    let def = defaultPath;
    if (!def) {
      try {
        def = await vaultClient.getDefaultPath();
      } catch {
        def = "Documents/Gosidian Vault";
      }
    }

    const previewEl = document.getElementById("defaultVaultPathPreview");
    if (previewEl && def) previewEl.textContent = def;

    const locationInput = document.getElementById("newVaultLocationInput") as HTMLInputElement;
    if (locationInput && def) {
      const parentDir = def.replace(/[\/\\][^\/\\]+$/, "");
      locationInput.value = parentDir;
    }

    const skipBtn = document.getElementById("btnSkipVaultChooser");
    if (skipBtn) skipBtn.style.display = canCancel ? "block" : "none";

    this.openModal("vaultChooserModal");
  }

  public async switchVaultTo(path: string) {
    try {
      this.updateSaveIndicator("saving", "Switching vault...");
      const vault = await vaultClient.setVaultPath(path);
      localStorage.setItem("gosidian_vault_path", vault.path);
      this.activeVault = vault;
      this.updateVaultDisplay(vault);

      this.closeModal("vaultChooserModal");
      await this.refreshFileTree();
      await this.refreshTags();

      // Open Welcome Note
      if (this.flatNotesList.includes("Welcome to Gosidian.md")) {
        await this.openNote("Welcome to Gosidian.md");
      } else if (this.flatNotesList.length > 0 && this.flatNotesList[0]) {
        await this.openNote(this.flatNotesList[0]);
      } else {
        await this.handleNewNote();
      }

      this.updateSaveIndicator("saved", `Vault: ${vault.name}`);
    } catch (err) {
      console.error("Failed to switch vault:", err);
      alert("Failed to open vault: " + err);
    }
  }

  private updateVaultDisplay(vault: VaultInfo) {
    const vaultDisplay = document.getElementById("vaultNameDisplay");
    const vaultRootName = document.getElementById("vaultRootName");
    const statusVaultText = document.getElementById("statusVaultText");

    if (vaultDisplay) vaultDisplay.textContent = vault.name;
    if (vaultRootName) vaultRootName.textContent = vault.name;
    if (statusVaultText) statusVaultText.textContent = `Vault: ${vault.name} (${vault.noteCount} notes)`;
  }

  private async refreshFileTree() {
    try {
      this.fileTree = await vaultClient.listTree();
      this.flatNotesList = [];
      this.collectFlatNotes(this.fileTree, this.flatNotesList);
      this.renderFileTree();
    } catch (err) {
      console.error("Failed to refresh file tree:", err);
    }
  }

  private collectFlatNotes(nodes: FileNode[], result: string[]) {
    for (const node of nodes) {
      if (node.isDir && node.children) {
        this.collectFlatNotes(node.children, result);
      } else if (!node.isDir) {
        result.push(node.path);
      }
    }
  }

  // ------------------------------------------------------------------------
  // UI & Event Bindings
  // ------------------------------------------------------------------------

  private setupUI() {
    this.refreshIcons();

    // Ribbon buttons
    document.getElementById("ribbonToggleSidebar")?.addEventListener("click", () => this.toggleLeftSidebar());
    document.getElementById("ribbonQuickSwitcher")?.addEventListener("click", () => this.openQuickSwitcher());
    document.getElementById("ribbonGraphView")?.addEventListener("click", () => this.openGraphViewTab());
    document.getElementById("ribbonNewNote")?.addEventListener("click", () => this.handleNewNote());
    document.getElementById("ribbonDailyNote")?.addEventListener("click", () => this.openDailyNote());
    document.getElementById("ribbonCmdPalette")?.addEventListener("click", () => this.openCommandPalette());
    document.getElementById("ribbonSettingsBtn")?.addEventListener("click", () => this.openSettingsModal());
    document.getElementById("ribbonHelpBtn")?.addEventListener("click", () => this.openNote("Markdown Syntax Guide.md"));
    document.getElementById("ribbonTemplates")?.addEventListener("click", () => this.insertTemplate());
    document.getElementById("ribbonCanvas")?.addEventListener("click", () => this.openCanvasBoard());
    document.getElementById("canvasAddCardBtn")?.addEventListener("click", () => {
      this.spatialCanvas?.addTextCard(window.innerWidth / 2 - 140, window.innerHeight / 2 - 80);
    });
    document.getElementById("canvasZoomInBtn")?.addEventListener("click", () => this.spatialCanvas?.zoomIn());
    document.getElementById("canvasZoomOutBtn")?.addEventListener("click", () => this.spatialCanvas?.zoomOut());
    document.getElementById("canvasResetZoomBtn")?.addEventListener("click", () => this.spatialCanvas?.resetView());
    document.getElementById("closeRecoveryBtn")?.addEventListener("click", () => this.closeModal("fileRecoveryModal"));
    document.getElementById("ctxRecovery")?.addEventListener("click", () => {
      this.hideContextMenu();
      const cur = this.getCurrentTab();
      if (cur) this.openFileRecovery(cur.path);
    });
    document.getElementById("recoveryRestoreBtn")?.addEventListener("click", async () => {
      const cur = this.getCurrentTab();
      if (!cur || this.selectedRecoveryIndex < 0) return;
      const snap = this.activeRecoverySnapshots[this.selectedRecoveryIndex];
      if (!snap) return;
      try {
        await vaultClient.restoreSnapshot(cur.path, snap.id);
        await this.loadNoteContent(cur.path);
        this.closeModal("fileRecoveryModal");
        this.updateSaveIndicator("saved", `Restored version from ${snap.dateStr}`);
      } catch (err) {
        console.error("Failed to restore snapshot:", err);
      }
    });

    // Titlebar
    document.getElementById("quickSwitcherTrigger")?.addEventListener("click", () => this.openQuickSwitcher());
    document.getElementById("cmdPaletteTrigger")?.addEventListener("click", () => this.openCommandPalette());
    document.getElementById("toggleRightSidebarBtn")?.addEventListener("click", () => this.toggleRightSidebar());
    document.getElementById("navBackBtn")?.addEventListener("click", () => this.navigateHistory(-1));
    document.getElementById("navForwardBtn")?.addEventListener("click", () => this.navigateHistory(1));
    document.getElementById("vaultDropdownBtn")?.addEventListener("click", () => this.openVaultChooserModal(undefined, true));
    document.getElementById("ribbonSwitchVault")?.addEventListener("click", () => this.openVaultChooserModal(undefined, true));

    // Vault Chooser Modal actions
    document.getElementById("btnChooseDefaultVault")?.addEventListener("click", async () => {
      let def = "";
      try { def = await vaultClient.getDefaultPath(); } catch { def = ""; }
      await this.switchVaultTo(def);
    });

    document.getElementById("btnBrowseExistingFolder")?.addEventListener("click", async () => {
      try {
        const path = await vaultClient.chooseFolderDialog();
        const input = document.getElementById("existingVaultPathInput") as HTMLInputElement;
        if (input && path) input.value = path;
      } catch (err) {
        console.error("Browse folder failed:", err);
      }
    });

    document.getElementById("btnOpenExistingVault")?.addEventListener("click", async () => {
      const input = document.getElementById("existingVaultPathInput") as HTMLInputElement;
      const path = input?.value.trim();
      if (!path) {
        alert("Please enter or select a folder path.");
        return;
      }
      await this.switchVaultTo(path);
    });

    document.getElementById("btnBrowseNewLocation")?.addEventListener("click", async () => {
      try {
        const path = await vaultClient.chooseFolderDialog();
        const input = document.getElementById("newVaultLocationInput") as HTMLInputElement;
        if (input && path) input.value = path;
      } catch (err) {
        console.error("Browse location failed:", err);
      }
    });

    document.getElementById("btnCreateNewVault")?.addEventListener("click", async () => {
      const locInput = document.getElementById("newVaultLocationInput") as HTMLInputElement;
      const nameInput = document.getElementById("newVaultNameInput") as HTMLInputElement;
      const loc = locInput?.value.trim();
      const name = nameInput?.value.trim();
      if (!name) {
        alert("Please enter a vault name.");
        return;
      }
      const target = loc ? `${loc}/${name}` : name;
      await this.switchVaultTo(target);
    });

    document.getElementById("btnSkipVaultChooser")?.addEventListener("click", () => {
      this.closeModal("vaultChooserModal");
    });

    // Left sidebar tabs
    document.querySelectorAll(".sidebar-left .sidebar-tab").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tab = (e.currentTarget as HTMLElement).getAttribute("data-tab");
        if (tab) this.switchLeftSidebarTab(tab);
      });
    });

    // Right sidebar tabs
    document.querySelectorAll(".sidebar-right .sidebar-tab").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tab = (e.currentTarget as HTMLElement).getAttribute("data-tab");
        if (tab) this.switchRightSidebarTab(tab);
      });
    });

    // File Explorer actions
    document.getElementById("actionNewNote")?.addEventListener("click", () => this.handleNewNote());
    document.getElementById("actionNewFolder")?.addEventListener("click", () => this.handleNewFolder());
    document.getElementById("actionCollapseAll")?.addEventListener("click", () => this.collapseAllFolders());
    document.getElementById("newTabBtn")?.addEventListener("click", () => this.handleNewNote());

    // Search panel
    const searchInput = document.getElementById("vaultSearchInput") as HTMLInputElement;
    searchInput?.addEventListener("input", () => this.handleVaultSearch(searchInput.value));

    // Mode Switcher buttons
    document.getElementById("modeLivePreview")?.addEventListener("click", () => this.setViewMode("live"));
    document.getElementById("modeReading")?.addEventListener("click", () => this.setViewMode("reading"));
    document.getElementById("modeSplit")?.addEventListener("click", () => this.setViewMode("split"));
    document.getElementById("toggleGraphViewBtn")?.addEventListener("click", () => this.openGraphViewTab());
    document.getElementById("bookmarkCurrentBtn")?.addEventListener("click", () => this.toggleBookmarkCurrentNote());
    document.getElementById("moreActionsBtn")?.addEventListener("click", (e) => this.showMoreActionsMenu(e));

    // Editor textarea input
    const editor = document.getElementById("markdownEditor") as HTMLTextAreaElement;
    editor?.addEventListener("input", () => this.handleEditorChange());
    editor?.addEventListener("keydown", (e) => this.handleEditorKeyDown(e));

    // Document title input
    const titleInput = document.getElementById("documentTitleInput") as HTMLInputElement;
    titleInput?.addEventListener("blur", () => this.handleTitleChange(titleInput.value));
    titleInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        titleInput.blur();
      }
    });

    // Graph View Controls
    const graphSearch = document.getElementById("graphFilterInput") as HTMLInputElement;
    graphSearch?.addEventListener("input", () => {
      this.graph?.setFilter(graphSearch.value);
    });
    document.getElementById("graphResetZoomBtn")?.addEventListener("click", () => {
      this.graph?.resetView();
    });
    document.getElementById("graphTogglePhysicsBtn")?.addEventListener("click", (e) => {
      const active = this.graph?.togglePhysics();
      (e.currentTarget as HTMLElement).classList.toggle("active", active);
    });

    // Graph Settings Panel Toggle & Sliders
    const toggleGraphSettingsBtn = document.getElementById("graphToggleSettingsBtn");
    const graphSettingsPanel = document.getElementById("graphSettingsPanel");
    toggleGraphSettingsBtn?.addEventListener("click", () => {
      graphSettingsPanel?.classList.toggle("open");
    });

    const bindGraphSlider = (id: string, prop: keyof GraphPhysicsConfig, isFloat = false) => {
      const slider = document.getElementById(id) as HTMLInputElement;
      slider?.addEventListener("input", () => {
        if (!this.graph) return;
        const val = isFloat ? parseFloat(slider.value) : parseInt(slider.value, 10);
        (this.graph.config as any)[prop] = val;
      });
    };
    bindGraphSlider("sliderRepel", "repelForce");
    bindGraphSlider("sliderDistance", "linkDistance");
    bindGraphSlider("sliderCenter", "centerForce", true);
    bindGraphSlider("sliderNodeScale", "nodeScale", true);
    bindGraphSlider("sliderLinkThickness", "linkThickness", true);

    // Resizable Splitters
    const splitLeft = document.getElementById("splitHandleLeft");
    const sidebarLeft = document.getElementById("sidebarLeft");
    if (splitLeft && sidebarLeft) {
      let dragging = false;
      splitLeft.addEventListener("mousedown", (e) => {
        dragging = true;
        document.body.style.cursor = "col-resize";
        e.preventDefault();
      });
      window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const newWidth = Math.max(160, Math.min(600, e.clientX - 40));
        sidebarLeft.style.width = `${newWidth}px`;
      });
      window.addEventListener("mouseup", () => {
        if (dragging) {
          dragging = false;
          document.body.style.cursor = "";
          this.graph?.resize();
        }
      });
    }

    const splitRight = document.getElementById("splitHandleRight");
    const sidebarRight = document.getElementById("sidebarRight");
    if (splitRight && sidebarRight) {
      let dragging = false;
      splitRight.addEventListener("mousedown", (e) => {
        dragging = true;
        document.body.style.cursor = "col-resize";
        e.preventDefault();
      });
      window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const newWidth = Math.max(180, Math.min(600, window.innerWidth - e.clientX));
        sidebarRight.style.width = `${newWidth}px`;
      });
      window.addEventListener("mouseup", () => {
        if (dragging) {
          dragging = false;
          document.body.style.cursor = "";
          this.graph?.resize();
        }
      });
    }

    // Settings Search Filter
    const settingsSearchInput = document.getElementById("settingsSearchInput") as HTMLInputElement;
    settingsSearchInput?.addEventListener("input", () => {
      const q = settingsSearchInput.value.toLowerCase().trim();
      document.querySelectorAll(".settings-nav-item").forEach((item) => {
        const text = item.textContent?.toLowerCase() || "";
        (item as HTMLElement).style.display = !q || text.includes(q) ? "flex" : "none";
      });
    });

    // Explorer reveal in OS
    document.getElementById("openInExplorerBtn")?.addEventListener("click", () => {
      const cur = this.getCurrentTab();
      if (cur) vaultClient.openInOS(cur.path);
    });
    document.getElementById("closeRightSidebarBtn")?.addEventListener("click", () => this.toggleRightSidebar());
    this.setupSplitResizers();

    // Close settings modal
    document.getElementById("closeSettingsBtn")?.addEventListener("click", () => {
      this.closeModal("settingsModal");
    });

    // Settings navigation
    document.querySelectorAll(".settings-nav-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        const sec = (e.currentTarget as HTMLElement).getAttribute("data-section");
        if (sec) this.renderSettingsSection(sec);
      });
    });

    // Global click dismissals
    document.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".context-menu")) {
        this.hideContextMenu();
      }
      if (!target.closest("#wikilinkAutocomplete")) {
        this.hideWikiLinkAutocomplete();
      }
    });
  }

  private refreshIcons() {
    createIcons({ icons });
  }

  // ------------------------------------------------------------------------
  // Hotkeys & Navigation
  // ------------------------------------------------------------------------

  private setupHotkeys() {
    window.addEventListener("keydown", (e) => {
      // 1. If currently recording in Settings -> Hotkeys
      if (this.recordingCommandId) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") {
          this.recordingCommandId = null;
          this.renderHotkeysSection();
          return;
        }
        const combo = this.eventToShortcut(e);
        if (combo && combo !== "Escape") {
          this.customHotkeys[this.recordingCommandId] = combo;
          this.saveCustomHotkeys();
          this.recordingCommandId = null;
          this.renderHotkeysSection();
        }
        return;
      }

      // 2. Escape closes modals
      if (e.key === "Escape") {
        this.closeAllModals();
        return;
      }

      // 3. Match against registered commands
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      const isAlt = e.altKey;
      if (!isCmdOrCtrl && !isAlt && !e.key.startsWith("F")) {
        return;
      }

      const combo = this.eventToShortcut(e);
      if (!combo) return;

      const cmd = this.commands.find((c) => {
        const sc = this.getEffectiveShortcut(c.id);
        return sc && sc.toLowerCase() === combo.toLowerCase();
      });

      if (cmd) {
        e.preventDefault();
        cmd.action();
      }
    });
  }

  private closeAllModals() {
    this.closeModal("quickSwitcherModal");
    this.closeModal("cmdPaletteModal");
    this.closeModal("settingsModal");
    this.closeModal("promptModal");
    this.hideContextMenu();
    this.hideWikiLinkAutocomplete();
  }

  private closeModal(id: string) {
    if (id === "settingsModal") {
      this.recordingCommandId = null;
    }
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }

  private openModal(id: string) {
    const el = document.getElementById(id);
    if (el) el.style.display = "flex";
  }

  // ------------------------------------------------------------------------
  // Tabs & Document Management
  // ------------------------------------------------------------------------

  public async openNote(relPath: string) {
    if (this.tabs[this.activeTabIndex]?.isGraph) {
      this.showDocumentViewport();
    }

    const existingIdx = this.tabs.findIndex((t) => t.path === relPath);
    if (existingIdx !== -1) {
      this.switchTab(existingIdx);
      return;
    }

    const isCanvas = relPath.toLowerCase().endsWith(".canvas");
    const title = relPath.replace(/\.md$/i, "").replace(/\.canvas$/i, "").split("/").pop() || relPath;
    const tab: Tab = {
      id: "tab_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      path: relPath,
      title,
      isDirty: false,
      isCanvas,
    };

    this.tabs.push(tab);
    this.switchTab(this.tabs.length - 1);
  }

  private async switchTab(index: number) {
    if (index < 0 || index >= this.tabs.length) return;
    this.activeTabIndex = index;
    const tab = this.tabs[index]!;

    if (!tab.isGraph && (this.historyIndex === -1 || this.history[this.historyIndex] !== tab.path)) {
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(tab.path);
      this.historyIndex = this.history.length - 1;
      this.updateHistoryButtons();
    }

    this.renderTabs();

    if (tab.isGraph) {
      this.showGraphViewport();
    } else if (tab.isCanvas) {
      this.showCanvasViewport(tab.path);
    } else {
      this.showDocumentViewport();
      await this.loadNoteContent(tab.path);
    }
  }

  private closeTab(index: number, e?: Event) {
    if (e) e.stopPropagation();
    if (index < 0 || index >= this.tabs.length) return;

    this.tabs.splice(index, 1);
    if (this.tabs.length === 0) {
      this.handleNewNote();
    } else {
      const nextIndex = Math.min(this.activeTabIndex, this.tabs.length - 1);
      this.switchTab(nextIndex);
    }
  }

  private renderTabs() {
    const container = document.getElementById("tabsContainer");
    if (!container) return;

    container.innerHTML = "";
    this.tabs.forEach((tab, idx) => {
      const tabEl = document.createElement("div");
      tabEl.className = `tab-item ${idx === this.activeTabIndex ? "active" : ""}`;
      const iconName = tab.isGraph ? "git-fork" : tab.isCanvas ? "layout-grid" : "file-text";

      tabEl.innerHTML = `
        <i data-lucide="${iconName}" class="icon-xs"></i>
        <span class="tab-title">${this.escape(tab.title)}</span>
        <button class="tab-close" title="Close tab"><i data-lucide="x" class="icon-xs"></i></button>
      `;

      tabEl.addEventListener("click", () => this.switchTab(idx));
      tabEl.querySelector(".tab-close")?.addEventListener("click", (e) => this.closeTab(idx, e));
      container.appendChild(tabEl);
    });

    this.refreshIcons();
  }

  private getCurrentTab(): Tab | null {
    return this.tabs[this.activeTabIndex] || null;
  }

  private async loadNoteContent(relPath: string) {
    try {
      this.updateSaveIndicator("saving", "Loading note...");
      const content = await vaultClient.readFile(relPath);

      const titleInput = document.getElementById("documentTitleInput") as HTMLInputElement;
      const pathDisplay = document.getElementById("documentPathDisplay");
      const editor = document.getElementById("markdownEditor") as HTMLTextAreaElement;

      const title = relPath.replace(/\.md$/i, "").split("/").pop() || "";
      if (titleInput) titleInput.value = title;
      if (pathDisplay) pathDisplay.textContent = relPath;
      if (editor) editor.value = content;

      this.renderMarkdown(content);
      this.updateCounts(content);
      this.updateFileInfo(relPath, content);
      this.updateBacklinks(title, relPath);

      this.updateSaveIndicator("saved", "Saved");
      this.highlightActiveInTree(relPath);
    } catch (err) {
      console.error("Failed to read note:", err);
      this.updateSaveIndicator("saving", "Error reading file");
    }
  }

  private handleEditorChange() {
    const editor = document.getElementById("markdownEditor") as HTMLTextAreaElement;
    if (!editor) return;
    const content = editor.value;

    this.renderMarkdown(content);
    this.updateCounts(content);

    const cur = this.getCurrentTab();
    if (cur) cur.isDirty = true;
    this.updateSaveIndicator("saving", "Saving...");

    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = window.setTimeout(() => {
      this.saveCurrentNoteImmediately();
    }, 600);
  }

  private async saveCurrentNoteImmediately() {
    const cur = this.getCurrentTab();
    if (!cur || cur.isGraph) return;

    const editor = document.getElementById("markdownEditor") as HTMLTextAreaElement;
    if (!editor) return;

    try {
      await vaultClient.saveFile(cur.path, editor.value);
      cur.isDirty = false;
      this.updateSaveIndicator("saved", "Saved");
      this.refreshTags();
    } catch (err) {
      console.error("Failed to save note:", err);
      this.updateSaveIndicator("saving", "Save failed");
    }
  }

  private updateSaveIndicator(status: "saved" | "saving", message: string) {
    const ind = document.getElementById("statusSaveIndicator");
    if (!ind) return;
    if (status === "saved") {
      ind.innerHTML = `<i data-lucide="check" class="icon-xs text-success"></i> <span>${this.escape(message)}</span>`;
    } else {
      ind.innerHTML = `<i data-lucide="loader-2" class="icon-xs" style="animation:spin 1s linear infinite"></i> <span>${this.escape(message)}</span>`;
    }
    this.refreshIcons();
  }

  // ------------------------------------------------------------------------
  // Markdown Rendering & Inline WikiLinks
  // ------------------------------------------------------------------------

  private renderMarkdown(content: string) {
    const preview = document.getElementById("previewContent");
    if (!preview) return;

    const knownSet = new Set(this.flatNotesList.map((p) => p.replace(/\.md$/i, "").split("/").pop()!.toLowerCase()));
    const result = parseMarkdown(content, knownSet);
    preview.innerHTML = result.html;

    preview.querySelectorAll(".wikilink").forEach((link) => {
      const target = link.getAttribute("data-target");
      if (!target) return;

      link.addEventListener("click", () => {
        this.navigateToWikiLink(target);
      });

      link.addEventListener("mouseenter", (e) => {
        this.showWikiLinkHoverPreview(target, e as MouseEvent);
      });

      link.addEventListener("mouseleave", () => {
        this.hideWikiLinkHoverPreview();
      });
    });

    preview.querySelectorAll(".task-checkbox").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const lineIdxStr = (e.currentTarget as HTMLElement).getAttribute("data-line-index");
        if (lineIdxStr !== null) {
          this.toggleTaskCheckbox(parseInt(lineIdxStr, 10));
        }
      });
    });

    preview.querySelectorAll(".props-collapse-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const table = (e.currentTarget as HTMLElement).closest(".properties-table");
        const body = table?.querySelector(".props-body") as HTMLElement;
        if (body) {
          const isHidden = body.style.display === "none";
          body.style.display = isHidden ? "flex" : "none";
          (e.currentTarget as HTMLElement).innerHTML = `<i data-lucide="${isHidden ? 'chevron-down' : 'chevron-right'}" class="icon-xs"></i>`;
          this.refreshIcons();
        }
      });
    });

    this.renderOutline(result.headings);
    this.renderOutgoingLinks(result.wikiLinks);
  }

  private toggleTaskCheckbox(lineIndex: number) {
    const editor = document.getElementById("markdownEditor") as HTMLTextAreaElement;
    if (!editor) return;

    const lines = editor.value.split("\n");
    if (lineIndex >= 0 && lineIndex < lines.length) {
      const line = lines[lineIndex]!;
      if (line.includes("- [ ]")) {
        lines[lineIndex] = line.replace("- [ ]", "- [x]");
      } else if (line.includes("- [x]") || line.includes("- [X]")) {
        lines[lineIndex] = line.replace(/- \[[xX]\]/, "- [ ]");
      }
      editor.value = lines.join("\n");
      this.handleEditorChange();
    }
  }

  private async navigateToWikiLink(targetName: string) {
    const cleanName = targetName.trim().toLowerCase();
    const foundPath = this.flatNotesList.find((p) => {
      const base = p.replace(/\.md$/i, "").split("/").pop()?.toLowerCase();
      return base === cleanName;
    });

    if (foundPath) {
      this.openNote(foundPath);
    } else {
      const newPath = targetName.trim() + ".md";
      const initial = `# ${targetName.trim()}\n\nCreated from [[WikiLink]].\n`;
      try {
        const created = await vaultClient.createNote(newPath, initial);
        await this.refreshFileTree();
        this.openNote(created.path);
      } catch (err) {
        console.error("Failed to create wiki-linked note:", err);
      }
    }
  }

  private async showWikiLinkHoverPreview(targetName: string, e: MouseEvent) {
    const card = document.getElementById("hoverPreviewCard");
    const cardTitle = document.getElementById("hoverPreviewTitle");
    const cardBody = document.getElementById("hoverPreviewBody");
    if (!card || !cardTitle || !cardBody) return;

    const cleanName = targetName.trim().toLowerCase();
    const foundPath = this.flatNotesList.find((p) => {
      const base = p.replace(/\.md$/i, "").split("/").pop()?.toLowerCase();
      return base === cleanName;
    });

    cardTitle.textContent = targetName;
    if (foundPath) {
      try {
        const content = await vaultClient.readFile(foundPath);
        const snippet = content.slice(0, 300) + (content.length > 300 ? "..." : "");
        cardBody.textContent = snippet;
      } catch {
        cardBody.textContent = "Unable to read note preview.";
      }
    } else {
      cardBody.textContent = "Note does not exist yet. Click to create.";
    }

    card.style.left = `${Math.min(window.innerWidth - 340, e.clientX + 10)}px`;
    card.style.top = `${Math.min(window.innerHeight - 240, e.clientY + 15)}px`;
    card.style.display = "block";
  }

  private hideWikiLinkHoverPreview() {
    const card = document.getElementById("hoverPreviewCard");
    if (card) card.style.display = "none";
  }

  // ------------------------------------------------------------------------
  // WikiLink Autocomplete in Editor
  // ------------------------------------------------------------------------

  private handleEditorKeyDown(e: KeyboardEvent) {
    const popup = document.getElementById("wikilinkAutocomplete");
    const isOpen = popup && popup.style.display !== "none";

    if (isOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.moveAutocompleteSelection(1);
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.moveAutocompleteSelection(-1);
        return;
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        this.selectAutocompleteItem();
        return;
      } else if (e.key === "Escape") {
        this.hideWikiLinkAutocomplete();
        return;
      }
    }

    setTimeout(() => {
      this.checkWikiLinkTrigger();
    }, 10);
  }

  private checkWikiLinkTrigger() {
    const editor = document.getElementById("markdownEditor") as HTMLTextAreaElement;
    if (!editor) return;

    const cursor = editor.selectionStart;
    const textBefore = editor.value.slice(0, cursor);
    const lastOpen = textBefore.lastIndexOf("[[");

    if (lastOpen !== -1 && lastOpen >= cursor - 30) {
      const query = textBefore.slice(lastOpen + 2);
      if (!query.includes("]]") && !query.includes("\n")) {
        this.showWikiLinkAutocomplete(query, lastOpen);
        return;
      }
    }

    this.hideWikiLinkAutocomplete();
  }

  private showWikiLinkAutocomplete(query: string, triggerPos: number) {
    const popup = document.getElementById("wikilinkAutocomplete");
    const list = document.getElementById("autocompleteList");
    const editor = document.getElementById("markdownEditor") as HTMLTextAreaElement;
    if (!popup || !list || !editor) return;

    const lowerQuery = query.toLowerCase();
    const matches = this.flatNotesList
      .map((p) => p.replace(/\.md$/i, "").split("/").pop()!)
      .filter((name) => name.toLowerCase().includes(lowerQuery))
      .slice(0, 8);

    if (matches.length === 0) {
      this.hideWikiLinkAutocomplete();
      return;
    }

    list.innerHTML = "";
    matches.forEach((name, idx) => {
      const item = document.createElement("div");
      item.className = `popup-item ${idx === 0 ? "selected" : ""}`;
      item.setAttribute("data-name", name);
      item.innerHTML = `<i data-lucide="file-text" class="icon-xs"></i> <span>${this.escape(name)}</span>`;
      item.addEventListener("click", () => {
        this.insertWikiLink(name, triggerPos);
      });
      list.appendChild(item);
    });

    this.refreshIcons();

    popup.style.display = "block";
    popup.style.top = "160px";
    popup.style.left = "80px";
  }

  private moveAutocompleteSelection(dir: number) {
    const items = Array.from(document.querySelectorAll("#autocompleteList .popup-item"));
    if (items.length === 0) return;
    let sel = items.findIndex((el) => el.classList.contains("selected"));
    if (sel !== -1) items[sel]?.classList.remove("selected");
    sel = (sel + dir + items.length) % items.length;
    items[sel]?.classList.add("selected");
    items[sel]?.scrollIntoView({ block: "nearest" });
  }

  private selectAutocompleteItem() {
    const sel = document.querySelector("#autocompleteList .popup-item.selected") as HTMLElement;
    if (sel) {
      const name = sel.getAttribute("data-name");
      const editor = document.getElementById("markdownEditor") as HTMLTextAreaElement;
      if (name && editor) {
        const textBefore = editor.value.slice(0, editor.selectionStart);
        const lastOpen = textBefore.lastIndexOf("[[");
        if (lastOpen !== -1) {
          this.insertWikiLink(name, lastOpen);
        }
      }
    }
  }

  private insertWikiLink(name: string, triggerPos: number) {
    const editor = document.getElementById("markdownEditor") as HTMLTextAreaElement;
    if (!editor) return;

    const before = editor.value.slice(0, triggerPos);
    const after = editor.value.slice(editor.selectionStart);
    editor.value = `${before}[[${name}]]${after}`;

    const newCursor = triggerPos + name.length + 4;
    editor.selectionStart = newCursor;
    editor.selectionEnd = newCursor;
    editor.focus();

    this.hideWikiLinkAutocomplete();
    this.handleEditorChange();
  }

  private hideWikiLinkAutocomplete() {
    const popup = document.getElementById("wikilinkAutocomplete");
    if (popup) popup.style.display = "none";
  }

  // ------------------------------------------------------------------------
  // File Explorer & Tree Rendering
  // ------------------------------------------------------------------------

  private renderFileTree() {
    const container = document.getElementById("fileTreeContainer");
    if (!container) return;

    container.innerHTML = "";
    this.renderNodes(this.fileTree, container);
    this.refreshIcons();
  }

  private renderNodes(nodes: FileNode[], parentEl: HTMLElement) {
    nodes.forEach((node) => {
      const nodeEl = document.createElement("div");
      nodeEl.className = "tree-node";

      const row = document.createElement("div");
      row.className = "tree-row";
      row.setAttribute("data-path", node.path);

      if (node.isDir) {
        row.innerHTML = `
          <span class="tree-chevron"><i data-lucide="chevron-right" class="icon-xs"></i></span>
          <i data-lucide="folder" class="icon-xs tree-icon"></i>
          <span class="tree-name">${this.escape(node.name)}</span>
        `;

        const childrenContainer = document.createElement("div");
        childrenContainer.className = "tree-children";
        childrenContainer.style.display = "none";

        row.addEventListener("click", () => {
          const isExp = childrenContainer.style.display !== "none";
          childrenContainer.style.display = isExp ? "none" : "flex";
          row.querySelector(".tree-chevron")?.classList.toggle("expanded", !isExp);
          const icon = row.querySelector(".tree-icon");
          if (icon) {
            icon.setAttribute("data-lucide", isExp ? "folder" : "folder-open");
            this.refreshIcons();
          }
        });

        if (node.children) {
          this.renderNodes(node.children, childrenContainer);
        }

        nodeEl.appendChild(row);
        nodeEl.appendChild(childrenContainer);
      } else {
        row.innerHTML = `
          <span style="width:14px; flex-shrink:0;"></span>
          <i data-lucide="file-text" class="icon-xs tree-icon"></i>
          <span class="tree-name">${this.escape(node.name.replace(/\.md$/i, ""))}</span>
        `;

        row.addEventListener("click", () => {
          this.openNote(node.path);
        });

        row.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          this.showContextMenu(node.path, e.clientX, e.clientY);
        });

        nodeEl.appendChild(row);
      }

      parentEl.appendChild(nodeEl);
    });
  }

  private highlightActiveInTree(relPath: string) {
    document.querySelectorAll(".tree-row").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-path") === relPath);
    });
  }

  private collapseAllFolders() {
    document.querySelectorAll(".tree-children").forEach((el) => {
      (el as HTMLElement).style.display = "none";
    });
    document.querySelectorAll(".tree-chevron").forEach((el) => {
      el.classList.remove("expanded");
    });
  }

  private insertTemplate() {
    const cur = this.getCurrentTab();
    if (!cur || cur.isGraph) return;
    const editor = document.getElementById("markdownEditor") as HTMLTextAreaElement;
    if (!editor) return;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);
    const snippet = `---\ntitle: ${cur.title}\ndate: ${dateStr}\ntags: [note]\n---\n\n## Notes - ${dateStr} ${timeStr}\n\n- \n`;
    editor.value = snippet + editor.value;
    this.handleEditorChange();
  }

  public async openCanvasBoard() {
    const existing = this.flatNotesList.find((p) => p.toLowerCase().endsWith(".canvas"));
    if (existing) {
      this.openNote(existing);
    } else {
      try {
        const created = await vaultClient.createCanvas("My Ideas Board.canvas");
        await this.refreshFileTree();
        this.openNote(created.path);
      } catch (err) {
        console.error("Failed to create canvas:", err);
      }
    }
  }

  public async openFileRecovery(relPath?: string) {
    const targetPath = relPath || this.getCurrentTab()?.path;
    if (!targetPath) return;

    this.openModal("fileRecoveryModal");
    const header = document.getElementById("recoveryFileHeader");
    if (header) header.textContent = `File Recovery: ${targetPath}`;

    const listEl = document.getElementById("recoverySnapshotsList");
    const previewEl = document.getElementById("recoveryPreviewText") as HTMLTextAreaElement;
    const restoreBtn = document.getElementById("recoveryRestoreBtn");
    const timeEl = document.getElementById("recoverySnapshotTime");

    if (listEl) listEl.innerHTML = '<div class="empty-hint">Loading snapshots...</div>';
    if (previewEl) previewEl.value = "";
    if (restoreBtn) restoreBtn.style.display = "none";

    try {
      this.activeRecoverySnapshots = await vaultClient.getFileSnapshots(targetPath);
      if (!listEl) return;
      listEl.innerHTML = "";

      if (this.activeRecoverySnapshots.length === 0) {
        listEl.innerHTML = '<div class="empty-hint">No snapshots saved for this file yet.<br><br>Snapshots are automatically recorded in .gosidian/recovery whenever note changes are saved.</div>';
        return;
      }

      this.activeRecoverySnapshots.forEach((snap, idx) => {
        const item = document.createElement("div");
        item.className = "recovery-item";
        item.innerHTML = `
          <div class="recovery-item-date">${this.escape(snap.dateStr)}</div>
          <div class="recovery-item-meta">${snap.size} bytes · ${this.escape(snap.id.slice(0, 10))}...</div>
        `;
        item.addEventListener("click", () => {
          document.querySelectorAll(".recovery-item").forEach((el) => el.classList.remove("active"));
          item.classList.add("active");
          this.selectedRecoveryIndex = idx;
          if (previewEl) previewEl.value = snap.content;
          if (timeEl) timeEl.textContent = `Snapshot from ${snap.dateStr} (${snap.size} bytes)`;
          if (restoreBtn) restoreBtn.style.display = "inline-flex";
        });
        listEl.appendChild(item);
      });

      (listEl.firstElementChild as HTMLElement)?.click();
    } catch (err) {
      console.error("Failed to load snapshots:", err);
    }
  }

  // ------------------------------------------------------------------------
  // Note Creation, Renaming, Deletion
  // ------------------------------------------------------------------------

  private async handleNewNote(folderRel: string = "") {
    this.showPromptModal("New Note", "Enter name for the new note:", "Untitled Note", async (name) => {
      if (!name.trim()) return;
      let path = folderRel ? `${folderRel}/${name.trim()}` : name.trim();
      if (!path.endsWith(".md")) path += ".md";

      const title = name.replace(/\.md$/i, "");
      const content = `# ${title}\n\n`;
      try {
        const created = await vaultClient.createNote(path, content);
        await this.refreshFileTree();
        this.openNote(created.path);
      } catch (err) {
        console.error("Failed to create note:", err);
      }
    });
  }

  private async handleNewFolder() {
    this.showPromptModal("New Folder", "Enter name for the new folder:", "New Folder", async (name) => {
      if (!name.trim()) return;
      try {
        await vaultClient.createFolder(name.trim());
        await this.refreshFileTree();
      } catch (err) {
        console.error("Failed to create folder:", err);
      }
    });
  }

  private async handleTitleChange(newTitle: string) {
    const cur = this.getCurrentTab();
    if (!cur || cur.isGraph) return;

    const oldTitle = cur.title;
    if (newTitle.trim() === "" || newTitle.trim() === oldTitle) return;

    const dir = cur.path.includes("/") ? cur.path.substring(0, cur.path.lastIndexOf("/")) : "";
    const newPath = dir ? `${dir}/${newTitle.trim()}.md` : `${newTitle.trim()}.md`;

    try {
      await vaultClient.renamePath(cur.path, newPath);
      cur.path = newPath;
      cur.title = newTitle.trim();
      const pathDisplay = document.getElementById("documentPathDisplay");
      if (pathDisplay) pathDisplay.textContent = newPath;
      this.renderTabs();
      await this.refreshFileTree();
    } catch (err) {
      console.error("Failed to rename note:", err);
    }
  }

  private async openDailyNote() {
    const today = new Date().toISOString().slice(0, 10);
    const dailyPath = `Daily Notes/${today}.md`;
    if (this.flatNotesList.includes(dailyPath)) {
      this.openNote(dailyPath);
    } else {
      const content = `# Daily Note - ${today} 📅\n\n## Tasks for today\n- [ ] Review notes\n- [ ] Brainstorm ideas\n\n## Journal\n\n#daily #journal\n`;
      try {
        const node = await vaultClient.createNote(dailyPath, content);
        await this.refreshFileTree();
        this.openNote(node.path);
      } catch (err) {
        console.error("Failed to create daily note:", err);
      }
    }
  }

  // ------------------------------------------------------------------------
  // Force-Directed Graph View
  // ------------------------------------------------------------------------

  public async openGraphViewTab() {
    const existing = this.tabs.findIndex((t) => t.isGraph);
    if (existing !== -1) {
      this.switchTab(existing);
      return;
    }

    const tab: Tab = {
      id: "graph_tab",
      path: "@graph",
      title: "Graph View",
      isGraph: true,
    };
    this.tabs.push(tab);
    this.switchTab(this.tabs.length - 1);
  }

  private showGraphViewport() {
    const canvasView = document.getElementById("canvasViewContainer");
    if (canvasView) canvasView.style.display = "none";
    const docView = document.getElementById("documentView");
    const graphContainer = document.getElementById("graphViewContainer");
    if (docView) docView.style.display = "none";
    if (graphContainer) graphContainer.style.display = "flex";

    this.initGraphCanvas();
  }

  private showCanvasViewport(path: string) {
    const docView = document.getElementById("documentView");
    const graphView = document.getElementById("graphViewContainer");
    const canvasView = document.getElementById("canvasViewContainer");
    if (docView) docView.style.display = "none";
    if (graphView) graphView.style.display = "none";
    if (canvasView) canvasView.style.display = "flex";

    const titleEl = document.getElementById("canvasTitleDisplay");
    if (titleEl) titleEl.textContent = path.split("/").pop() || path;

    const mount = document.getElementById("spatialCanvasMount");
    if (mount) {
      if (!this.spatialCanvas) {
        this.spatialCanvas = new SpatialCanvas(mount);
        this.spatialCanvas.onSave = (data) => {
          vaultClient.saveFile(path, JSON.stringify(data, null, 2));
        };
      }
      vaultClient.readFile(path).then((content) => {
        this.spatialCanvas?.loadData(content);
      });
    }
  }

  private showDocumentViewport() {
    const canvasView = document.getElementById("canvasViewContainer");
    if (canvasView) canvasView.style.display = "none";
    const docView = document.getElementById("documentView");
    const graphContainer = document.getElementById("graphViewContainer");
    if (docView) docView.style.display = "flex";
    if (graphContainer) graphContainer.style.display = "none";
  }

  private async initGraphCanvas() {
    const canvas = document.getElementById("graphCanvas") as HTMLCanvasElement;
    if (!canvas) return;

    if (!this.graph) {
      this.graph = new ForceGraph(canvas);
      this.graph.onNodeClick = (node: SimNode) => {
        this.openNote(node.path);
      };
      this.graph.onNodeHover = (node: SimNode | null, x: number, y: number) => {
        const tooltip = document.getElementById("graphNodeTooltip");
        if (!tooltip) return;
        if (node) {
          tooltip.innerHTML = `<strong>${this.escape(node.title)}</strong><br/><span style="color:var(--text-faint)">${node.linkCount} connections</span>`;
          tooltip.style.left = `${x}px`;
          tooltip.style.top = `${y}px`;
          tooltip.style.display = "block";
        } else {
          tooltip.style.display = "none";
        }
      };
    }

    try {
      this.graphData = await vaultClient.getGraphData();
      this.graph.setData(this.graphData);

      const nodeCountEl = document.getElementById("graphNodeCount");
      const linkCountEl = document.getElementById("graphLinkCount");
      if (nodeCountEl) nodeCountEl.textContent = this.graphData.nodes.length.toString();
      if (linkCountEl) linkCountEl.textContent = this.graphData.links.length.toString();
    } catch (err) {
      console.error("Failed to load graph data:", err);
    }
  }

  // ------------------------------------------------------------------------
  // Quick Switcher & Command Palette
  // ------------------------------------------------------------------------

  private openQuickSwitcher() {
    this.openModal("quickSwitcherModal");
    const input = document.getElementById("switcherInput") as HTMLInputElement;
    if (input) {
      input.value = "";
      input.focus();
    }
    this.filterQuickSwitcher("");

    input?.addEventListener("input", () => this.filterQuickSwitcher(input.value));
    input?.addEventListener("keydown", (e) => this.handleSwitcherKeyDown(e));
  }

  private filterQuickSwitcher(query: string) {
    const resultsContainer = document.getElementById("switcherResults");
    if (!resultsContainer) return;

    const lower = query.toLowerCase().trim();
    this.switcherResultsList = this.flatNotesList.filter((p) => p.toLowerCase().includes(lower));
    this.selectedSwitcherIndex = 0;

    resultsContainer.innerHTML = "";
    if (this.switcherResultsList.length === 0) {
      resultsContainer.innerHTML = `<div class="result-row selected">Create new note: "<strong>${this.escape(query)}</strong>"</div>`;
      return;
    }

    this.switcherResultsList.forEach((path, idx) => {
      const row = document.createElement("div");
      row.className = `result-row ${idx === this.selectedSwitcherIndex ? "selected" : ""}`;
      const title = path.replace(/\.md$/i, "");
      row.innerHTML = `
        <i data-lucide="file-text" class="icon-sm"></i>
        <span>${this.escape(title)}</span>
        <span class="result-badge">${this.escape(path)}</span>
      `;
      row.addEventListener("click", () => {
        this.openNote(path);
        this.closeModal("quickSwitcherModal");
      });
      resultsContainer.appendChild(row);
    });

    this.refreshIcons();
  }

  private handleSwitcherKeyDown(e: KeyboardEvent) {
    const rows = document.querySelectorAll("#switcherResults .result-row");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.selectedSwitcherIndex = Math.min(this.selectedSwitcherIndex + 1, rows.length - 1);
      this.updateSwitcherSelection();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.selectedSwitcherIndex = Math.max(this.selectedSwitcherIndex - 1, 0);
      this.updateSwitcherSelection();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const input = document.getElementById("switcherInput") as HTMLInputElement;
      if (this.switcherResultsList.length > 0 && this.switcherResultsList[this.selectedSwitcherIndex]) {
        this.openNote(this.switcherResultsList[this.selectedSwitcherIndex]!);
      } else if (input && input.value.trim()) {
        this.handleNewNote();
      }
      this.closeModal("quickSwitcherModal");
    }
  }

  private updateSwitcherSelection() {
    const rows = document.querySelectorAll("#switcherResults .result-row");
    rows.forEach((r, i) => {
      r.classList.toggle("selected", i === this.selectedSwitcherIndex);
      if (i === this.selectedSwitcherIndex) r.scrollIntoView({ block: "nearest" });
    });
  }

  private openCommandPalette() {
    this.openModal("cmdPaletteModal");
    const input = document.getElementById("paletteInput") as HTMLInputElement;
    if (input) {
      input.value = "";
      input.focus();
    }
    this.filterCommandPalette("");

    input?.addEventListener("input", () => this.filterCommandPalette(input.value));
    input?.addEventListener("keydown", (e) => this.handlePaletteKeyDown(e));
  }

  private filterCommandPalette(query: string) {
    const resultsContainer = document.getElementById("paletteResults");
    if (!resultsContainer) return;

    const lower = query.toLowerCase().trim();
    this.paletteFilteredCommands = this.commands.filter((cmd) => cmd.title.toLowerCase().includes(lower));
    this.selectedPaletteIndex = 0;

    resultsContainer.innerHTML = "";
    this.paletteFilteredCommands.forEach((cmd, idx) => {
      const row = document.createElement("div");
      row.className = `result-row ${idx === this.selectedPaletteIndex ? "selected" : ""}`;
      row.innerHTML = `
        <i data-lucide="${cmd.icon}" class="icon-sm"></i>
        <span>${this.escape(cmd.title)}</span>
        ${this.getEffectiveShortcut(cmd.id) ? `<span class="result-badge"><kbd>${this.escape(this.getEffectiveShortcut(cmd.id)!)}</kbd></span>` : ""}
      `;
      row.addEventListener("click", () => {
        cmd.action();
        this.closeModal("cmdPaletteModal");
      });
      resultsContainer.appendChild(row);
    });

    this.refreshIcons();
  }

  private handlePaletteKeyDown(e: KeyboardEvent) {
    const rows = document.querySelectorAll("#paletteResults .result-row");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.selectedPaletteIndex = Math.min(this.selectedPaletteIndex + 1, rows.length - 1);
      this.updatePaletteSelection();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.selectedPaletteIndex = Math.max(this.selectedPaletteIndex - 1, 0);
      this.updatePaletteSelection();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = this.paletteFilteredCommands[this.selectedPaletteIndex];
      if (cmd) cmd.action();
      this.closeModal("cmdPaletteModal");
    }
  }

  private updatePaletteSelection() {
    const rows = document.querySelectorAll("#paletteResults .result-row");
    rows.forEach((r, i) => {
      r.classList.toggle("selected", i === this.selectedPaletteIndex);
      if (i === this.selectedPaletteIndex) r.scrollIntoView({ block: "nearest" });
    });
  }

  private registerCommands() {
    this.commands = [
      { id: "switcher", title: "Quick Switcher: Open note", shortcut: "Ctrl+O", icon: "search", action: () => this.openQuickSwitcher() },
      { id: "cmd-palette", title: "Command Palette: Open command palette", shortcut: "Ctrl+P", icon: "terminal", action: () => this.openCommandPalette() },
      { id: "template", title: "Templates: Insert date and note template", icon: "copy-plus", action: () => this.insertTemplate() },
      { id: "graph", title: "Graph View: Open interactive graph", shortcut: "Ctrl+G", icon: "git-fork", action: () => this.openGraphViewTab() },
      { id: "canvas", title: "Canvas: Open or create Infinite Spatial Canvas", icon: "layout-grid", action: () => this.openCanvasBoard() },
      { id: "recovery", title: "File Recovery: View historical snapshots for active note", icon: "history", action: () => this.openFileRecovery() },
      { id: "new-note", title: "File: Create new note", shortcut: "Ctrl+N", icon: "file-plus-2", action: () => this.handleNewNote() },
      { id: "daily", title: "Daily Notes: Open today's note", icon: "calendar", action: () => this.openDailyNote() },
      { id: "save", title: "File: Save current note", shortcut: "Ctrl+S", icon: "save", action: () => this.saveCurrentNoteImmediately() },
      { id: "live-mode", title: "View: Toggle Live Preview mode", icon: "edit-3", action: () => this.setViewMode("live") },
      { id: "reading-mode", title: "View: Toggle Reading View", icon: "book-open", action: () => this.setViewMode("reading") },
      { id: "split-mode", title: "View: Toggle Side-by-side Split View", icon: "columns-2", action: () => this.setViewMode("split") },
      { id: "toggle-left", title: "View: Toggle left sidebar", shortcut: "Ctrl+B", icon: "panel-left", action: () => this.toggleLeftSidebar() },
      { id: "toggle-right", title: "View: Toggle right sidebar", shortcut: "Ctrl+Shift+B", icon: "panel-right", action: () => this.toggleRightSidebar() },
      { id: "toggle-readable", title: "View: Toggle full width / readable line length", icon: "maximize-2", action: () => this.toggleReadableLineLength() },
      { id: "reset-split", title: "View: Reset 50/50 split ratio", icon: "columns-2", action: () => this.resetSplitRatio() },
      { id: "bookmark", title: "Bookmarks: Bookmark active note", icon: "bookmark", action: () => this.toggleBookmarkCurrentNote() },
      { id: "explorer", title: "System: Show current note in File Explorer", icon: "folder-open", action: () => {
        const cur = this.getCurrentTab();
        if (cur) vaultClient.openInOS(cur.path);
      }},
      { id: "settings", title: "Settings: Open settings", icon: "settings", action: () => this.openSettingsModal() },
    ];
  }

  // ------------------------------------------------------------------------
  // Sidebars & Inspectors
  // ------------------------------------------------------------------------

  private toggleLeftSidebar() {
    const sidebar = document.getElementById("sidebarLeft");
    const btn = document.getElementById("ribbonToggleSidebar");
    sidebar?.classList.toggle("collapsed");
    btn?.classList.toggle("active", !sidebar?.classList.contains("collapsed"));
    setTimeout(() => this.graph?.resize(), 250);
  }

  private toggleRightSidebar() {
    const sidebar = document.getElementById("sidebarRight");
    sidebar?.classList.toggle("collapsed");
    setTimeout(() => this.graph?.resize(), 250);
  }

  private switchLeftSidebarTab(tab: string) {
    document.querySelectorAll(".sidebar-left .sidebar-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
    document.querySelectorAll(".sidebar-left .sidebar-panel").forEach((p) => {
      p.classList.remove("active");
    });
    const target = document.getElementById(`panel${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    if (target) target.classList.add("active");
  }

  private switchRightSidebarTab(tab: string) {
    document.querySelectorAll(".sidebar-right .sidebar-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
    document.querySelectorAll(".sidebar-right .sidebar-panel").forEach((p) => {
      p.classList.remove("active");
    });
    const target = document.getElementById(`panel${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    if (target) target.classList.add("active");
  }

  private toggleReadableLineLength() {
    const center = document.querySelector(".workspace-center");
    center?.classList.toggle("full-width-active");
  }

  private resetSplitRatio() {
    const editorPane = document.getElementById("editorPane");
    const previewPane = document.getElementById("previewPane");
    if (editorPane && previewPane) {
      editorPane.style.flex = "1 1 50%";
      previewPane.style.flex = "1 1 50%";
    }
  }

  private setupSplitResizers() {
    const leftHandle = document.getElementById("splitHandleLeft");
    const rightHandle = document.getElementById("splitHandleRight");
    const editorHandle = document.getElementById("editorSplitResizer");
    const sidebarLeft = document.getElementById("sidebarLeft");
    const sidebarRight = document.getElementById("sidebarRight");
    const editorPane = document.getElementById("editorPane");
    const previewPane = document.getElementById("previewPane");
    const editorWorkspace = document.getElementById("editorWorkspace");

    if (leftHandle && sidebarLeft) {
      let startX = 0;
      let startWidth = 0;
      const onMouseMove = (e: MouseEvent) => {
        const dx = e.clientX - startX;
        let newW = startWidth + dx;
        if (newW < 80) {
          if (!sidebarLeft.classList.contains("collapsed")) this.toggleLeftSidebar();
          return;
        }
        if (sidebarLeft.classList.contains("collapsed")) this.toggleLeftSidebar();
        newW = Math.max(160, Math.min(500, newW));
        sidebarLeft.style.width = `${newW}px`;
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        leftHandle.classList.remove("dragging");
        this.graph?.resize();
      };
      leftHandle.addEventListener("mousedown", (e) => {
        startX = e.clientX;
        startWidth = sidebarLeft.getBoundingClientRect().width;
        leftHandle.classList.add("dragging");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });
    }

    if (rightHandle && sidebarRight) {
      let startX = 0;
      let startWidth = 0;
      const onMouseMove = (e: MouseEvent) => {
        const dx = startX - e.clientX;
        let newW = startWidth + dx;
        if (newW < 80) {
          if (!sidebarRight.classList.contains("collapsed")) this.toggleRightSidebar();
          return;
        }
        if (sidebarRight.classList.contains("collapsed")) this.toggleRightSidebar();
        newW = Math.max(180, Math.min(600, newW));
        sidebarRight.style.width = `${newW}px`;
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        rightHandle.classList.remove("dragging");
        this.graph?.resize();
      };
      rightHandle.addEventListener("mousedown", (e) => {
        startX = e.clientX;
        startWidth = sidebarRight.getBoundingClientRect().width;
        rightHandle.classList.add("dragging");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });
    }

    if (editorHandle && editorPane && previewPane && editorWorkspace) {
      const onMouseMove = (e: MouseEvent) => {
        const rect = editorWorkspace.getBoundingClientRect();
        const pct = Math.min(80, Math.max(20, ((e.clientX - rect.left) / rect.width) * 100));
        editorPane.style.flex = `0 0 ${pct}%`;
        previewPane.style.flex = "1 1 0";
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        editorHandle.classList.remove("dragging");
      };
      editorHandle.addEventListener("mousedown", () => {
        editorHandle.classList.add("dragging");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });
      editorHandle.addEventListener("dblclick", () => {
        this.resetSplitRatio();
      });
    }
  }

  private setViewMode(mode: "live" | "reading" | "split") {
    this.viewMode = mode;
    const center = document.querySelector(".workspace-center");
    if (!center) return;

    center.classList.remove("mode-reading-active", "mode-split-active");
    if (mode === "reading") center.classList.add("mode-reading-active");
    if (mode === "split") {
      center.classList.add("mode-split-active");
      const sidebarRight = document.getElementById("sidebarRight");
      if (sidebarRight && !sidebarRight.classList.contains("collapsed") && window.innerWidth < 1400) {
        this.toggleRightSidebar();
      }
    }

    document.querySelectorAll(".view-mode-group .mode-btn").forEach((b) => b.classList.remove("active"));
    const activeBtn = document.getElementById(`mode${mode.charAt(0).toUpperCase() + mode.slice(1)}${mode === "live" ? "Preview" : ""}`);
    if (activeBtn) activeBtn.classList.add("active");

    const statusPill = document.getElementById("statusModePill");
    if (statusPill) {
      statusPill.textContent = mode === "live" ? "Live Preview" : mode === "reading" ? "Reading View" : "Split View";
    }
  }

  // ------------------------------------------------------------------------
  // Backlinks & Outgoing Links & Outline & Info
  // ------------------------------------------------------------------------

  private async updateBacklinks(title: string, currentPath: string) {
    const listEl = document.getElementById("backlinksList");
    const unlinkedEl = document.getElementById("unlinkedMentionsList");
    const statusBacklinksText = document.getElementById("statusBacklinksText");
    if (!listEl || !unlinkedEl) return;

    listEl.innerHTML = "";
    unlinkedEl.innerHTML = "";

    try {
      const results = await vaultClient.searchVault(title);
      let count = 0;

      results.forEach((res: SearchResult) => {
        if (res.path === currentPath) return;

        const isLinked = res.matches.some((m) => m.lineText.includes(`[[${title}`) || m.lineText.includes(`[[${title}|`));
        const item = document.createElement("div");
        item.className = "link-item";
        item.innerHTML = `
          <i data-lucide="file-text" class="icon-xs"></i>
          <span>${this.escape(res.name.replace(/\.md$/i, ""))}</span>
        `;
        item.addEventListener("click", () => this.openNote(res.path));

        if (isLinked) {
          listEl.appendChild(item);
          count++;
        } else {
          unlinkedEl.appendChild(item);
        }
      });

      if (listEl.children.length === 0) {
        listEl.innerHTML = '<div class="empty-hint">No linked mentions found.</div>';
      }
      if (unlinkedEl.children.length === 0) {
        unlinkedEl.innerHTML = '<div class="empty-hint">No unlinked mentions found.</div>';
      }

      if (statusBacklinksText) statusBacklinksText.textContent = `${count} backlink${count === 1 ? "" : "s"}`;
      this.refreshIcons();
    } catch (err) {
      console.error("Failed to query backlinks:", err);
    }
  }

  private renderOutgoingLinks(links: string[]) {
    const container = document.getElementById("outgoingLinksList");
    if (!container) return;
    container.innerHTML = "";

    if (links.length === 0) {
      container.innerHTML = '<div class="empty-hint">No outgoing links in this note.</div>';
      return;
    }

    links.forEach((target) => {
      const item = document.createElement("div");
      item.className = "link-item";
      item.innerHTML = `<i data-lucide="link" class="icon-xs"></i> <span>${this.escape(target)}</span>`;
      item.addEventListener("click", () => this.navigateToWikiLink(target));
      container.appendChild(item);
    });
    this.refreshIcons();
  }

  private renderOutline(headings: HeadingItem[]) {
    const container = document.getElementById("outlineList");
    if (!container) return;
    container.innerHTML = "";

    if (headings.length === 0) {
      container.innerHTML = '<div class="empty-hint">No headings in this note.</div>';
      return;
    }

    headings.forEach((h) => {
      const item = document.createElement("div");
      item.className = `outline-item outline-h${h.level}`;
      item.textContent = h.text;
      item.addEventListener("click", () => {
        const el = document.getElementById(h.id);
        el?.scrollIntoView({ behavior: "smooth" });
      });
      container.appendChild(item);
    });
  }

  private updateCounts(content: string) {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const chars = content.length;
    const countsEl = document.getElementById("statusCounts");
    if (countsEl) countsEl.textContent = `${words} words · ${chars} characters`;

    const infoWord = document.getElementById("infoWordCount");
    const infoChar = document.getElementById("infoCharCount");
    const infoRead = document.getElementById("infoReadTime");
    if (infoWord) infoWord.textContent = words.toString();
    if (infoChar) infoChar.textContent = chars.toString();
    if (infoRead) infoRead.textContent = `${Math.ceil(words / 200)} min`;
  }

  private updateFileInfo(relPath: string, content: string) {
    const fileName = relPath.split("/").pop() || "";
    const infoFileName = document.getElementById("infoFileName");
    const infoFilePath = document.getElementById("infoFilePath");
    const infoLastMod = document.getElementById("infoLastMod");

    if (infoFileName) infoFileName.textContent = fileName;
    if (infoFilePath) infoFilePath.textContent = relPath;
    if (infoLastMod) infoLastMod.textContent = new Date().toLocaleTimeString();
  }

  // ------------------------------------------------------------------------
  // Search, Bookmarks, Tags
  // ------------------------------------------------------------------------

  private async handleVaultSearch(query: string) {
    const resultsContainer = document.getElementById("searchResultsContainer");
    const countEl = document.getElementById("searchResultsCount");
    if (!resultsContainer || !countEl) return;

    if (!query.trim()) {
      resultsContainer.innerHTML = "";
      countEl.textContent = "";
      return;
    }

    try {
      const results = await vaultClient.searchVault(query);
      countEl.textContent = `${results.length} notes matched`;
      resultsContainer.innerHTML = "";

      results.forEach((res: SearchResult) => {
        const item = document.createElement("div");
        item.className = "search-result-item";
        let matchesHtml = "";
        res.matches.slice(0, 3).forEach((m) => {
          matchesHtml += `<div class="search-match-snippet">${this.escape(m.lineText)}</div>`;
        });

        item.innerHTML = `
          <div class="search-result-file"><i data-lucide="file-text" class="icon-xs"></i> <span>${this.escape(res.name)}</span></div>
          ${matchesHtml}
        `;
        item.addEventListener("click", () => {
          this.openNote(res.path);
        });
        resultsContainer.appendChild(item);
      });
      this.refreshIcons();
    } catch (err) {
      console.error("Vault search failed:", err);
    }
  }

  private toggleBookmarkCurrentNote() {
    const cur = this.getCurrentTab();
    if (!cur || cur.isGraph) return;

    if (this.bookmarks.has(cur.path)) {
      this.bookmarks.delete(cur.path);
    } else {
      this.bookmarks.add(cur.path);
    }
    this.renderBookmarks();
  }

  private renderBookmarks() {
    const list = document.getElementById("bookmarksList");
    if (!list) return;
    list.innerHTML = "";

    if (this.bookmarks.size === 0) {
      list.innerHTML = '<div class="empty-hint">Click the bookmark icon in any note header to pin it here.</div>';
      return;
    }

    this.bookmarks.forEach((path) => {
      const item = document.createElement("div");
      item.className = "link-item";
      const title = path.replace(/\.md$/i, "").split("/").pop() || path;
      item.innerHTML = `<i data-lucide="bookmark" class="icon-xs"></i> <span>${this.escape(title)}</span>`;
      item.addEventListener("click", () => this.openNote(path));
      list.appendChild(item);
    });
    this.refreshIcons();
  }

  private async refreshTags() {
    const list = document.getElementById("tagsList");
    if (!list) return;

    try {
      const data = await vaultClient.getGraphData();
      const tagCounts = new Map<string, number>();
      data.nodes.forEach((n) => {
        n.tags?.forEach((t) => {
          tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
        });
      });

      list.innerHTML = "";
      if (tagCounts.size === 0) {
        list.innerHTML = '<div class="empty-hint">No #tags found in vault notes yet.</div>';
        return;
      }

      tagCounts.forEach((count, tag) => {
        const pill = document.createElement("span");
        pill.className = "tag-pill";
        pill.innerHTML = `#${this.escape(tag)} <span class="tag-count">(${count})</span>`;
        pill.addEventListener("click", () => {
          this.switchLeftSidebarTab("search");
          const searchInput = document.getElementById("vaultSearchInput") as HTMLInputElement;
          if (searchInput) {
            searchInput.value = `#${tag}`;
            this.handleVaultSearch(`#${tag}`);
          }
        });
        list.appendChild(pill);
      });
    } catch (err) {
      console.error("Failed to refresh tags:", err);
    }
  }

  // ------------------------------------------------------------------------
  // Settings & Context Menu & Modals
  // ------------------------------------------------------------------------

  private openSettingsModal(section = "general") {
    this.openModal("settingsModal");
    this.renderSettingsSection(section);
  }

  private async renderSettingsSection(section: string) {
    document.querySelectorAll(".settings-nav-item").forEach((item) => {
      item.classList.toggle("active", item.getAttribute("data-section") === section);
    });

    const titleEl = document.getElementById("settingsSectionTitle");
    const bodyEl = document.getElementById("settingsSectionBody");
    if (!titleEl || !bodyEl) return;

    if (section === "general") {
      titleEl.textContent = "General";
      bodyEl.innerHTML = `
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Vault Location</span>
            <span class="setting-desc">${this.escape(this.activeVault?.path || "")}</span>
          </div>
          <button id="btnRevealVault" class="btn btn-secondary">Open Folder</button>
        </div>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Go Desktop Engine</span>
            <span class="setting-desc">Powered by pure Go (github.com/egoist/mygo)</span>
          </div>
          <span class="status-badge">Active</span>
        </div>
      `;
      document.getElementById("btnRevealVault")?.addEventListener("click", () => {
        vaultClient.openInOS("");
      });
    } else if (section === "appearance") {
      titleEl.textContent = "Appearance";
      bodyEl.innerHTML = `
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Accent Color</span>
            <span class="setting-desc">Choose your signature Obsidian accent highlight</span>
          </div>
          <div class="color-options">
            <div class="color-dot active" style="background:#7c3aed" data-accent="purple" title="Obsidian Purple"></div>
            <div class="color-dot" style="background:#059669" data-accent="emerald" title="Emerald Green"></div>
            <div class="color-dot" style="background:#0284c7" data-accent="ocean" title="Ocean Blue"></div>
            <div class="color-dot" style="background:#d97706" data-accent="amber" title="Amber Gold"></div>
            <div class="color-dot" style="background:#e11d48" data-accent="rose" title="Rose Ruby"></div>
          </div>
        </div>
      `;
      document.querySelectorAll(".color-dot").forEach((dot) => {
        dot.addEventListener("click", (e) => {
          document.querySelectorAll(".color-dot").forEach((d) => d.classList.remove("active"));
          const target = e.currentTarget as HTMLElement;
          target.classList.add("active");
          const accent = target.getAttribute("data-accent");
          if (accent === "purple") {
            document.body.removeAttribute("data-accent");
          } else if (accent) {
            document.body.setAttribute("data-accent", accent);
          }
        });
      });
    } else if (section === "editor") {
      titleEl.textContent = "Editor";
      bodyEl.innerHTML = `
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Live Preview Auto-Format</span>
            <span class="setting-desc">Render markdown formatting in real-time as you type</span>
          </div>
          <input type="checkbox" checked disabled />
        </div>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Auto-Save Delay</span>
            <span class="setting-desc">600ms debounced auto-save to disk via Go runtime</span>
          </div>
          <span class="status-badge">600 ms</span>
        </div>
      `;
    } else if (section === "graph") {
      titleEl.textContent = "Graph View";
      bodyEl.innerHTML = `
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Physics Engine</span>
            <span class="setting-desc">HTML5 60fps force-directed spring & Coulomb simulation</span>
          </div>
          <span class="status-badge">Enabled</span>
        </div>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Open Graph View</span>
            <span class="setting-desc">Jump straight to graph universe</span>
          </div>
          <button id="settingsOpenGraph" class="btn btn-primary">Open Graph</button>
        </div>
      `;
      document.getElementById("settingsOpenGraph")?.addEventListener("click", () => {
        this.closeModal("settingsModal");
        this.openGraphViewTab();
      });
    } else if (section === "about") {
      titleEl.textContent = "About Gosidian";
      const sysInfo = await vaultClient.getInfo();
      bodyEl.innerHTML = `
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Gosidian Desktop</span>
            <span class="setting-desc">Version 1.0.0 (Obsidian Pure Go Clone)</span>
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Go Version</span>
            <span class="setting-desc">${this.escape(sysInfo.goVersion)} (${sysInfo.os}/${sysInfo.arch})</span>
          </div>
        </div>
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-title">Framework</span>
            <span class="setting-desc">github.com/egoist/mygo (pure Go, zero cgo)</span>
          </div>
        </div>
      `;
    } else if (section === "hotkeys") {
      this.renderHotkeysSection();
    } else if (section === "files") {
      this.renderFilesSection();
    }
  }

  private renderHotkeysSection() {
    const titleEl = document.getElementById("settingsSectionTitle");
    const bodyEl = document.getElementById("settingsSectionBody");
    if (!titleEl || !bodyEl) return;

    titleEl.textContent = "Hotkeys";

    const filterVal = (document.getElementById("hotkeysFilterInput") as HTMLInputElement)?.value || "";

    bodyEl.innerHTML = `
      <div class="hotkeys-container">
        <div class="hotkeys-top-bar">
          <div class="hotkeys-filter-wrapper">
            <i data-lucide="search" class="icon-xs"></i>
            <input type="text" id="hotkeysFilterInput" placeholder="Filter hotkeys by command or key..." value="${this.escape(filterVal)}" />
          </div>
          <button id="resetAllHotkeysBtn" class="btn btn-secondary" title="Restore all default hotkeys">
            <i data-lucide="rotate-ccw" class="icon-xs"></i>
            <span>Restore Defaults</span>
          </button>
        </div>
        <div class="hotkeys-header-row">
          <span id="hotkeysCountDisplay"></span>
          <span>Click a hotkey to customize</span>
        </div>
        <div class="hotkeys-list" id="hotkeysListContainer"></div>
      </div>
    `;

    const filterInput = document.getElementById("hotkeysFilterInput") as HTMLInputElement;
    filterInput?.focus();
    filterInput?.addEventListener("input", () => this.updateHotkeysList(filterInput.value));

    document.getElementById("resetAllHotkeysBtn")?.addEventListener("click", () => {
      this.customHotkeys = {};
      this.saveCustomHotkeys();
      this.renderHotkeysSection();
    });

    this.updateHotkeysList(filterVal);
    this.refreshIcons();
  }

  private updateHotkeysList(query: string) {
    const listEl = document.getElementById("hotkeysListContainer");
    const countEl = document.getElementById("hotkeysCountDisplay");
    if (!listEl) return;

    const lower = query.toLowerCase().trim();
    const matched = this.commands.filter((cmd) => {
      const shortcut = this.getEffectiveShortcut(cmd.id) || "";
      return cmd.title.toLowerCase().includes(lower) || shortcut.toLowerCase().includes(lower);
    });

    if (countEl) countEl.textContent = `${matched.length} commands`;
    listEl.innerHTML = "";

    if (matched.length === 0) {
      listEl.innerHTML = '<div class="empty-hint">No commands match your filter.</div>';
      return;
    }

    matched.forEach((cmd) => {
      const row = document.createElement("div");
      row.className = "hotkey-row";
      const shortcut = this.getEffectiveShortcut(cmd.id);
      const isRecording = this.recordingCommandId === cmd.id;

      row.innerHTML = `
        <div class="hotkey-info">
          <i data-lucide="${cmd.icon}" class="icon-xs hotkey-icon"></i>
          <span class="hotkey-title">${this.escape(cmd.title)}</span>
        </div>
        <div class="hotkey-actions">
          ${
            isRecording
              ? `<span class="hotkey-badge recording">Press hotkey... (Esc to cancel)</span>`
              : shortcut
              ? `<kbd class="hotkey-badge" data-cmd-id="${cmd.id}" title="Click to customize">${this.escape(shortcut)}</kbd>`
              : `<span class="hotkey-badge unassigned" data-cmd-id="${cmd.id}" title="Click to assign hotkey">+ Assign</span>`
          }
          ${
            shortcut && !isRecording
              ? `<button class="hotkey-clear-btn" data-cmd-id="${cmd.id}" title="Remove hotkey"><i data-lucide="x" class="icon-xs"></i></button>`
              : ""
          }
        </div>
      `;

      row.querySelector(".hotkey-badge")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.recordingCommandId = cmd.id;
        this.renderHotkeysSection();
      });

      row.querySelector(".hotkey-clear-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.customHotkeys[cmd.id] = "";
        this.saveCustomHotkeys();
        this.renderHotkeysSection();
      });

      listEl.appendChild(row);
    });

    this.refreshIcons();
  }

  private renderFilesSection() {
    const titleEl = document.getElementById("settingsSectionTitle");
    const bodyEl = document.getElementById("settingsSectionBody");
    if (!titleEl || !bodyEl) return;

    titleEl.textContent = "Files and links";
    bodyEl.innerHTML = `
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-title">Default location for new notes</span>
          <span class="setting-desc">Where newly created notes are saved</span>
        </div>
        <span class="status-badge">Vault root</span>
      </div>
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-title">New link format</span>
          <span class="setting-desc">Bi-directional WikiLinks [[Note]] vs standard Markdown links [Note](Note.md)</span>
        </div>
        <span class="status-badge">WikiLink [[...]]</span>
      </div>
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-title">Auto-update internal links</span>
          <span class="setting-desc">Automatically update incoming WikiLinks when a note is renamed</span>
        </div>
        <span class="status-badge text-success">Enabled</span>
      </div>
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-title">Deleted files & version snapshots</span>
          <span class="setting-desc">Safe local snapshot history saved automatically in .gosidian/recovery</span>
        </div>
        <button id="btnOpenRecoveryFromSettings" class="btn btn-secondary">Open File Recovery</button>
      </div>
    `;

    document.getElementById("btnOpenRecoveryFromSettings")?.addEventListener("click", () => {
      this.closeModal("settingsModal");
      this.openFileRecovery();
    });
  }

  private showContextMenu(relPath: string, x: number, y: number) {
    const menu = document.getElementById("contextMenu");
    if (!menu) return;

    menu.style.left = `${Math.min(window.innerWidth - 180, x)}px`;
    menu.style.top = `${Math.min(window.innerHeight - 160, y)}px`;
    menu.style.display = "block";

    const renameBtn = document.getElementById("ctxRename");
    const deleteBtn = document.getElementById("ctxDelete");
    const openOSBtn = document.getElementById("ctxOpenInOS");

    const newRename = renameBtn?.cloneNode(true) as HTMLElement;
    const newDelete = deleteBtn?.cloneNode(true) as HTMLElement;
    const newOpenOS = openOSBtn?.cloneNode(true) as HTMLElement;

    renameBtn?.parentNode?.replaceChild(newRename, renameBtn);
    deleteBtn?.parentNode?.replaceChild(newDelete, deleteBtn);
    openOSBtn?.parentNode?.replaceChild(newOpenOS, openOSBtn);

    newRename?.addEventListener("click", () => {
      this.hideContextMenu();
      const currentName = relPath.replace(/\.md$/i, "").split("/").pop() || "";
      this.showPromptModal("Rename Note", "Enter new name:", currentName, async (name) => {
        if (!name.trim()) return;
        const dir = relPath.includes("/") ? relPath.substring(0, relPath.lastIndexOf("/")) : "";
        const targetPath = dir ? `${dir}/${name.trim()}.md` : `${name.trim()}.md`;
        await vaultClient.renamePath(relPath, targetPath);
        await this.refreshFileTree();
      });
    });

    newDelete?.addEventListener("click", () => {
      this.hideContextMenu();
      if (confirm(`Are you sure you want to delete "${relPath}"?`)) {
        vaultClient.deletePath(relPath).then(() => {
          this.refreshFileTree();
          const tabIdx = this.tabs.findIndex((t) => t.path === relPath);
          if (tabIdx !== -1) this.closeTab(tabIdx);
        });
      }
    });

    newOpenOS?.addEventListener("click", () => {
      this.hideContextMenu();
      vaultClient.openInOS(relPath);
    });

    this.refreshIcons();
  }

  private hideContextMenu() {
    const menu = document.getElementById("contextMenu");
    if (menu) menu.style.display = "none";
  }

  private showPromptModal(title: string, message: string, defaultValue: string, onConfirm: (val: string) => void) {
    this.openModal("promptModal");
    const titleEl = document.getElementById("promptTitle");
    const msgEl = document.getElementById("promptMessage");
    const input = document.getElementById("promptInput") as HTMLInputElement;
    const cancelBtn = document.getElementById("promptCancelBtn");
    const confirmBtn = document.getElementById("promptConfirmBtn");

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (input) {
      input.value = defaultValue;
      input.focus();
      input.select();
    }

    const handleConfirm = () => {
      this.closeModal("promptModal");
      if (input) onConfirm(input.value);
    };

    const newConfirm = confirmBtn?.cloneNode(true) as HTMLElement;
    const newCancel = cancelBtn?.cloneNode(true) as HTMLElement;
    confirmBtn?.parentNode?.replaceChild(newConfirm, confirmBtn);
    cancelBtn?.parentNode?.replaceChild(newCancel, cancelBtn);

    newConfirm?.addEventListener("click", handleConfirm);
    newCancel?.addEventListener("click", () => this.closeModal("promptModal"));

    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleConfirm();
      if (e.key === "Escape") this.closeModal("promptModal");
    });
  }

  private showMoreActionsMenu(e: MouseEvent) {
    const cur = this.getCurrentTab();
    if (!cur) return;
    this.showContextMenu(cur.path, e.clientX - 100, e.clientY + 20);
  }

  private navigateHistory(delta: number) {
    const newIdx = this.historyIndex + delta;
    if (newIdx >= 0 && newIdx < this.history.length) {
      this.historyIndex = newIdx;
      const targetPath = this.history[newIdx];
      if (targetPath) this.openNote(targetPath);
      this.updateHistoryButtons();
    }
  }

  private updateHistoryButtons() {
    const backBtn = document.getElementById("navBackBtn") as HTMLButtonElement;
    const forwardBtn = document.getElementById("navForwardBtn") as HTMLButtonElement;
    if (backBtn) backBtn.disabled = this.historyIndex <= 0;
    if (forwardBtn) forwardBtn.disabled = this.historyIndex >= this.history.length - 1;
  }

  private escape(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// Start Gosidian App on load
window.addEventListener("DOMContentLoaded", () => {
  new GosidianApp();
});
