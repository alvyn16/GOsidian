// ==========================================================================
// Gosidian Interactive Force-Directed Graph View Engine (HTML5 Canvas 60fps)
// ==========================================================================

import type { GraphData, GraphNode } from "./mygo";

export interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isDragging?: boolean;
}

export interface SimLink {
  source: SimNode;
  target: SimNode;
}

export interface GraphPhysicsConfig {
  repelForce: number;
  linkDistance: number;
  centerForce: number;
  nodeScale: number;
  linkThickness: number;
}

export class ForceGraph {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private nodes: SimNode[] = [];
  private links: SimLink[] = [];
  private nodesMap = new Map<string, SimNode>();

  // Camera transform
  private panX = 0;
  private panY = 0;
  private zoom = 1;

  // Interaction state
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private draggedNode: SimNode | null = null;
  private hoveredNode: SimNode | null = null;
  private simulationActive = true;
  private animFrameId: number | null = null;

  public config: GraphPhysicsConfig = {
    repelForce: 800,
    linkDistance: 110,
    centerForce: 0.001,
    nodeScale: 1.0,
    linkThickness: 1.0,
  };

  private filterQuery = "";
  public onNodeClick?: (node: SimNode) => void;
  public onNodeHover?: (node: SimNode | null, x: number, y: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.setupEvents();
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  public setData(data: GraphData) {
    this.nodesMap.clear();

    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    this.nodes = data.nodes.map((n) => {
      const radius = Math.min(18, Math.max(5, (5 + n.linkCount * 1.6) * this.config.nodeScale));
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * Math.min(width, height) * 0.35;
      const simNode: SimNode = {
        ...n,
        x: width / 2 + Math.cos(angle) * dist,
        y: height / 2 + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        radius,
        color: n.tags && n.tags.length > 0 ? "#a855f7" : "#7c3aed",
      };
      this.nodesMap.set(n.id, simNode);
      return simNode;
    });

    this.links = [];
    data.links.forEach((l) => {
      const src = this.nodesMap.get(l.source);
      const tgt = this.nodesMap.get(l.target);
      if (src && tgt) {
        this.links.push({ source: src, target: tgt });
      }
    });

    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
    this.start();
  }

  public setFilter(query: string) {
    this.filterQuery = query.toLowerCase().trim();
  }

  public resetView() {
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
  }

  public togglePhysics(): boolean {
    this.simulationActive = !this.simulationActive;
    return this.simulationActive;
  }

  public resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
  }

  public start() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    const loop = () => {
      this.tick();
      this.render();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  public stop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private tick() {
    if (!this.simulationActive) return;

    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const cx = width / 2;
    const cy = height / 2;

    const kRepulse = this.config.repelForce;
    const kSpring = 0.003;
    const restLength = this.config.linkDistance;
    const damping = 0.88;

    // 1. Repulsion between node pairs
    for (let i = 0; i < this.nodes.length; i++) {
      const n1 = this.nodes[i]!;
      for (let j = i + 1; j < this.nodes.length; j++) {
        const n2 = this.nodes[j]!;
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const distSq = dx * dx + dy * dy + 10;
        const dist = Math.sqrt(distSq);
        const force = kRepulse / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (!n1.isDragging) {
          n1.vx -= fx;
          n1.vy -= fy;
        }
        if (!n2.isDragging) {
          n2.vx += fx;
          n2.vy += fy;
        }
      }

      // Center gravity
      const dcx = cx - n1.x;
      const dcy = cy - n1.y;
      if (!n1.isDragging) {
        n1.vx += dcx * this.config.centerForce;
        n1.vy += dcy * this.config.centerForce;
      }
    }

    // 2. Link Spring attraction
    for (const link of this.links) {
      const dx = link.target.x - link.source.x;
      const dy = link.target.y - link.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const displacement = dist - restLength;
      const force = displacement * kSpring;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (!link.source.isDragging) {
        link.source.vx += fx;
        link.source.vy += fy;
      }
      if (!link.target.isDragging) {
        link.target.vx -= fx;
        link.target.vy -= fy;
      }
    }

    // 3. Apply velocities
    for (const node of this.nodes) {
      if (node.isDragging) continue;
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx;
      node.y += node.vy;
    }
  }

  private render() {
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;

    this.ctx.clearRect(0, 0, width, height);

    this.ctx.save();
    this.ctx.translate(width / 2 + this.panX, height / 2 + this.panY);
    this.ctx.scale(this.zoom, this.zoom);
    this.ctx.translate(-width / 2, -height / 2);

    const isHighlighting = !!this.hoveredNode;
    const neighborIds = new Set<string>();
    if (this.hoveredNode) {
      neighborIds.add(this.hoveredNode.id);
      for (const l of this.links) {
        if (l.source.id === this.hoveredNode.id) neighborIds.add(l.target.id);
        if (l.target.id === this.hoveredNode.id) neighborIds.add(l.source.id);
      }
    }

    // 1. Draw Links
    for (const link of this.links) {
      const isConnected =
        !isHighlighting || (neighborIds.has(link.source.id) && neighborIds.has(link.target.id));

      this.ctx.beginPath();
      this.ctx.moveTo(link.source.x, link.source.y);
      this.ctx.lineTo(link.target.x, link.target.y);
      this.ctx.strokeStyle = isConnected ? "rgba(147, 51, 234, 0.45)" : "rgba(255, 255, 255, 0.05)";
      this.ctx.lineWidth = (isConnected ? 1.5 : 0.8) * this.config.linkThickness;
      this.ctx.stroke();
    }

    // 2. Draw Nodes
    for (const node of this.nodes) {
      const isMatchesFilter =
        !this.filterQuery ||
        node.title.toLowerCase().includes(this.filterQuery) ||
        node.tags?.some((t) => t.toLowerCase().includes(this.filterQuery));

      const isNeighbor = !isHighlighting || neighborIds.has(node.id);
      const isTargetHover = this.hoveredNode?.id === node.id;

      const alpha = isMatchesFilter && isNeighbor ? 1 : 0.15;

      this.ctx.save();
      this.ctx.globalAlpha = alpha;

      // Glow effect for hovered or active node
      if (isTargetHover) {
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
        this.ctx.fillStyle = "rgba(168, 85, 247, 0.35)";
        this.ctx.fill();
      }

      // Main Node circle
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = isTargetHover ? "#c084fc" : node.color;
      this.ctx.fill();

      this.ctx.lineWidth = 1.5;
      this.ctx.strokeStyle = isTargetHover ? "#ffffff" : "rgba(255, 255, 255, 0.3)";
      this.ctx.stroke();

      // Label
      const shouldDrawLabel =
        isTargetHover ||
        this.zoom > 0.8 ||
        node.linkCount > 1 ||
        (this.filterQuery && isMatchesFilter);

      if (shouldDrawLabel) {
        this.ctx.font = `${isTargetHover ? "bold 12px" : "11px"} -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        this.ctx.textAlign = "center";
        this.ctx.fillStyle = isTargetHover ? "#ffffff" : "rgba(220, 221, 222, 0.85)";
        this.ctx.fillText(node.title, node.x, node.y + node.radius + 14);
      }

      this.ctx.restore();
    }

    this.ctx.restore();
  }

  private screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;
    const x = (screenX - width / 2 - this.panX) / this.zoom + width / 2;
    const y = (screenY - height / 2 - this.panY) / this.zoom + height / 2;
    return { x, y };
  }

  private findNodeAt(worldX: number, worldY: number): SimNode | null {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i]!;
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      if (dx * dx + dy * dy <= (node.radius + 6) * (node.radius + 6)) {
        return node;
      }
    }
    return null;
  }

  private setupEvents() {
    this.canvas.addEventListener("mousedown", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const world = this.screenToWorld(screenX, screenY);
      const hit = this.findNodeAt(world.x, world.y);

      if (hit) {
        this.draggedNode = hit;
        hit.isDragging = true;
      } else {
        this.isPanning = true;
        this.panStartX = screenX - this.panX;
        this.panStartY = screenY - this.panY;
      }
    });

    window.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      if (this.draggedNode) {
        const world = this.screenToWorld(screenX, screenY);
        this.draggedNode.x = world.x;
        this.draggedNode.y = world.y;
        this.draggedNode.vx = 0;
        this.draggedNode.vy = 0;
        return;
      }

      if (this.isPanning) {
        this.panX = screenX - this.panStartX;
        this.panY = screenY - this.panStartY;
        return;
      }

      // Check hover
      if (screenX >= 0 && screenX <= rect.width && screenY >= 0 && screenY <= rect.height) {
        const world = this.screenToWorld(screenX, screenY);
        const hit = this.findNodeAt(world.x, world.y);
        if (hit !== this.hoveredNode) {
          this.hoveredNode = hit;
          if (this.onNodeHover) {
            this.onNodeHover(hit, e.clientX, e.clientY);
          }
        }
      }
    });

    window.addEventListener("mouseup", () => {
      if (this.draggedNode) {
        this.draggedNode.isDragging = false;
        this.draggedNode = null;
      }
      this.isPanning = false;
    });

    this.canvas.addEventListener("click", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const world = this.screenToWorld(screenX, screenY);
      const hit = this.findNodeAt(world.x, world.y);
      if (hit && this.onNodeClick) {
        this.onNodeClick(hit);
      }
    });

    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.85;
        this.zoom = Math.min(4, Math.max(0.2, this.zoom * factor));
      },
      { passive: false }
    );
  }
}
