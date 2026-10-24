// ==========================================================================
// Gosidian Infinite 2D Spatial Canvas Engine (Obsidian JSON Canvas Compliant)
// ==========================================================================

export interface CanvasNodeData {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  color?: string;
}

export interface CanvasEdgeData {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: "top" | "right" | "bottom" | "left";
  toSide?: "top" | "right" | "bottom" | "left";
  label?: string;
  color?: string;
}

export interface CanvasData {
  nodes: CanvasNodeData[];
  edges: CanvasEdgeData[];
}

export class SpatialCanvas {
  private container: HTMLElement;
  private plane: HTMLElement;
  private svgLayer: SVGSVGElement;
  private nodesContainer: HTMLElement;

  private data: CanvasData = { nodes: [], edges: [] };
  private panX = 40;
  private panY = 40;
  private zoom = 1;

  private isPanning = false;
  private startPanX = 0;
  private startPanY = 0;

  private activeDraggingNodeId: string | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  public onSave?: (data: CanvasData) => void;
  public onNodeSelect?: (nodeId: string) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.innerHTML = "";
    this.container.className = "canvas-viewport";

    // Create plane with dot grid
    this.plane = document.createElement("div");
    this.plane.className = "canvas-plane";

    // SVG layer for connection lines
    this.svgLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svgLayer.setAttribute("class", "canvas-svg-layer");
    this.plane.appendChild(this.svgLayer);

    // Nodes container
    this.nodesContainer = document.createElement("div");
    this.nodesContainer.className = "canvas-nodes-container";
    this.plane.appendChild(this.nodesContainer);

    this.container.appendChild(this.plane);

    this.setupEvents();
    this.updateTransform();
  }

  public loadData(jsonContent: string) {
    try {
      const parsed = JSON.parse(jsonContent);
      this.data = {
        nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
        edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      };
    } catch {
      this.data = { nodes: [], edges: [] };
    }

    this.render();
  }

  public getData(): CanvasData {
    return this.data;
  }

  private setupEvents() {
    // Pan background
    this.container.addEventListener("mousedown", (e) => {
      const target = e.target as HTMLElement;
      if (target === this.container || target === this.plane || target.closest(".canvas-svg-layer")) {
        this.isPanning = true;
        this.startPanX = e.clientX - this.panX;
        this.startPanY = e.clientY - this.panY;
        this.container.style.cursor = "grabbing";
        e.preventDefault();
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.startPanX;
        this.panY = e.clientY - this.startPanY;
        this.updateTransform();
      } else if (this.activeDraggingNodeId) {
        const node = this.data.nodes.find((n) => n.id === this.activeDraggingNodeId);
        if (node) {
          node.x = (e.clientX - this.panX) / this.zoom - this.dragOffsetX;
          node.y = (e.clientY - this.panY) / this.zoom - this.dragOffsetY;
          this.updateNodeElement(node);
          this.renderEdges();
        }
      }
    });

    window.addEventListener("mouseup", () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.container.style.cursor = "default";
      }
      if (this.activeDraggingNodeId) {
        this.activeDraggingNodeId = null;
        this.triggerSave();
      }
    });

    // Zoom
    this.container.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(2.5, Math.max(0.25, this.zoom * zoomFactor));

      const rect = this.container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;

      this.updateTransform();
    }, { passive: false });
  }

  public addTextCard(x = 100, y = 100, text = "New Note Card\n\nDouble click to edit."): CanvasNodeData {
    const id = "card-" + Date.now();
    const node: CanvasNodeData = {
      id,
      type: "text",
      x: (x - this.panX) / this.zoom,
      y: (y - this.panY) / this.zoom,
      width: 260,
      height: 160,
      text,
    };
    this.data.nodes.push(node);
    this.render();
    this.triggerSave();
    return node;
  }

  public zoomIn() {
    this.zoom = Math.min(2.5, this.zoom * 1.2);
    this.updateTransform();
  }

  public zoomOut() {
    this.zoom = Math.max(0.25, this.zoom / 1.2);
    this.updateTransform();
  }

  public resetView() {
    this.zoom = 1;
    this.panX = 60;
    this.panY = 60;
    this.updateTransform();
  }

  private updateTransform() {
    this.plane.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.plane.style.transformOrigin = "0 0";
  }

  public render() {
    this.nodesContainer.innerHTML = "";
    this.data.nodes.forEach((node) => {
      const el = this.createNodeElement(node);
      this.nodesContainer.appendChild(el);
    });
    this.renderEdges();
  }

  private createNodeElement(node: CanvasNodeData): HTMLElement {
    const card = document.createElement("div");
    card.id = `canvas-node-${node.id}`;
    card.className = "canvas-card";
    if (node.color) card.setAttribute("data-color", node.color);
    this.updateNodeElement(node, card);

    // Card Header (Drag handle)
    const header = document.createElement("div");
    header.className = "canvas-card-header";
    header.innerHTML = `
      <div class="canvas-card-icon"><i data-lucide="file-text" class="icon-xs"></i></div>
      <div class="canvas-card-title">${node.id}</div>
      <div class="canvas-card-actions">
        <button class="icon-btn canvas-card-delete" title="Delete Card"><i data-lucide="trash-2" class="icon-xs"></i></button>
      </div>
    `;

    header.querySelector(".canvas-card-delete")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.deleteNode(node.id);
    });

    header.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).closest(".canvas-card-delete")) return;
      this.activeDraggingNodeId = node.id;
      const clientX = e.clientX;
      const clientY = e.clientY;
      const nodeX = node.x * this.zoom + this.panX;
      const nodeY = node.y * this.zoom + this.panY;
      this.dragOffsetX = (clientX - nodeX) / this.zoom;
      this.dragOffsetY = (clientY - nodeY) / this.zoom;
      e.stopPropagation();
    });

    // Content area
    const body = document.createElement("div");
    body.className = "canvas-card-body";

    const textarea = document.createElement("textarea");
    textarea.className = "canvas-card-textarea";
    textarea.value = node.text || "";
    textarea.placeholder = "Write markdown card content...";
    textarea.addEventListener("input", () => {
      node.text = textarea.value;
      this.triggerSave();
    });
    body.appendChild(textarea);

    card.appendChild(header);
    card.appendChild(body);

    // Resize handle
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "canvas-resize-handle";
    let isResizing = false;
    let startW = 0;
    let startH = 0;
    let startRX = 0;
    let startRY = 0;

    resizeHandle.addEventListener("mousedown", (e) => {
      isResizing = true;
      startW = node.width;
      startH = node.height;
      startRX = e.clientX;
      startRY = e.clientY;
      e.stopPropagation();
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const dw = (e.clientX - startRX) / this.zoom;
      const dh = (e.clientY - startRY) / this.zoom;
      node.width = Math.max(160, startW + dw);
      node.height = Math.max(100, startH + dh);
      this.updateNodeElement(node);
      this.renderEdges();
    });

    window.addEventListener("mouseup", () => {
      if (isResizing) {
        isResizing = false;
        this.triggerSave();
      }
    });

    card.appendChild(resizeHandle);
    return card;
  }

  private updateNodeElement(node: CanvasNodeData, element?: HTMLElement) {
    const el = element || document.getElementById(`canvas-node-${node.id}`);
    if (el) {
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      el.style.width = `${node.width}px`;
      el.style.height = `${node.height}px`;
    }
  }

  private deleteNode(id: string) {
    this.data.nodes = this.data.nodes.filter((n) => n.id !== id);
    this.data.edges = this.data.edges.filter((e) => e.fromNode !== id && e.toNode !== id);
    this.render();
    this.triggerSave();
  }

  private renderEdges() {
    this.svgLayer.innerHTML = "";
    const nodeMap = new Map<string, CanvasNodeData>();
    this.data.nodes.forEach((n) => nodeMap.set(n.id, n));

    // Marker def for arrow heads
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="#a855f7" />
      </marker>
    `;
    this.svgLayer.appendChild(defs);

    this.data.edges.forEach((edge) => {
      const from = nodeMap.get(edge.fromNode);
      const to = nodeMap.get(edge.toNode);
      if (!from || !to) return;

      const p1 = this.getNodeSidePoint(from, edge.fromSide || "right");
      const p2 = this.getNodeSidePoint(to, edge.toSide || "left");

      const dx = Math.abs(p2.x - p1.x) * 0.5;
      const pathD = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      path.setAttribute("stroke", edge.color || "#a855f7");
      path.setAttribute("stroke-width", "2.5");
      path.setAttribute("fill", "none");
      path.setAttribute("marker-end", "url(#arrow)");
      this.svgLayer.appendChild(path);

      if (edge.label) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", `${(p1.x + p2.x) / 2}`);
        text.setAttribute("y", `${(p1.y + p2.y) / 2 - 8}`);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "#dcddde");
        text.setAttribute("font-size", "11px");
        text.setAttribute("font-family", "sans-serif");
        text.textContent = edge.label;
        this.svgLayer.appendChild(text);
      }
    });
  }

  private getNodeSidePoint(node: CanvasNodeData, side: "top" | "right" | "bottom" | "left") {
    switch (side) {
      case "top":
        return { x: node.x + node.width / 2, y: node.y };
      case "right":
        return { x: node.x + node.width, y: node.y + node.height / 2 };
      case "bottom":
        return { x: node.x + node.width / 2, y: node.y + node.height };
      case "left":
      default:
        return { x: node.x, y: node.y + node.height / 2 };
    }
  }

  private triggerSave() {
    if (this.onSave) {
      this.onSave(this.data);
    }
  }
}
